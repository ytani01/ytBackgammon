#
# (c) Yoichi Tanibayashi
#
"""
test_save_load.py

保存・読み込み (TODO-024) のテスト。

保存の形は JSON Lines (~/ytbg-{server_id}.jsonl)。1 行目がメタ
(形式のバージョンとクロック)、以降が履歴 (h) と進む側の履歴 (f) で、
書かれた順がスタックの順。

旧形式 (~/ytbg-{server_id}.json) は .jsonl が無いときだけ読む。
**旧ファイルは消さない。書き戻しは常に .jsonl。**
"""
import json

import pytest

from ytbg.clock import Clock
from ytbg.gameinfo import GameInfo
from ytbg.storage import Storage

# 旧形式 (TODO-024 より前) のファイルの中身。
# clock_limit と board.clock を持ち、gameinfo に入っていた
OLD_ENT = {
    'sn': 1,
    'server_version': '0.90',
    'game_num': 2,
    'match_score': 5,
    'score': [1, 3],
    'turn': 1,
    'resign': -1,
    'clock_limit': [90, 9],
    'board': {
        'playername': ['Alice', 'Bob'],
        'clock': [[50, 3], [40, 2]],
        'cube': {'side': 1, 'value': 4, 'accepted': False},
        'dice': [[1, 2, 0, 0], [0, 0, 0, 0]],
        'checker': [[[6, 0]] * 15, [[19, 0]] * 15],
    },
}


def old_file(path, history=None, fwd_hist=None):
    """旧形式のファイルを書く"""
    if history is None:
        history = [OLD_ENT]
    if fwd_hist is None:
        fwd_hist = []
    path.write_text(json.dumps({'history': history, 'fwd_hist': fwd_hist}))


def read_lines(path):
    """JSON Lines を 1 行ずつ dict にして返す"""
    return [json.loads(ln) for ln in path.read_text().splitlines() if ln]


# ---------------------------------------------------------------------
# JSON Lines での往復
# ---------------------------------------------------------------------

async def test_save_and_load_roundtrip(bg_server, make_bg_server, req):
    """
    保存したものを読み直すと、履歴・_fwd_hist・クロックが戻る。

    同じ保存先で 2 つめのサーバを起動して確かめる (再起動の再現)。
    """
    await bg_server.on_json(
        req, {'type': 'set_clock_limit',
              'data': {'index': 0, 'clock_limit': 90}, 'history': False})
    await bg_server.on_json(
        req, {'type': 'put_checker',
              'data': {'ch': 0, 'p': 5, 'idx': 0}, 'history': True})
    await bg_server.on_json(
        req, {'type': 'put_checker',
              'data': {'ch': 1, 'p': 4, 'idx': 0}, 'history': True})
    await bg_server.backward_hist(1, sleep_sec=0)

    assert len(bg_server._hist.entries) == 2
    assert len(bg_server._hist.fwd_entries) == 1

    svr = make_bg_server()

    assert [h.sn for h in svr._hist.entries] == \
        [h.sn for h in bg_server._hist.entries]
    assert [h.to_dict() for h in svr._hist.entries] == \
        [h.to_dict() for h in bg_server._hist.entries]
    assert [h.to_dict() for h in svr._hist.fwd_entries] == \
        [h.to_dict() for h in bg_server._hist.fwd_entries]
    # いまの盤面は履歴の最後
    assert svr._gameinfo.to_dict() == svr._hist.entries[-1].to_dict()
    # クロックも戻る
    assert svr._clock.limit == [90, 12]
    assert svr._clock.clock == bg_server._clock.clock
    assert svr._clock.sw is True


async def test_saved_file_is_jsonl(bg_server, req):
    """
    保存されるのは 1 行目がメタの JSON Lines で、h / f が
    スタックの順に並ぶ。
    """
    await bg_server.on_json(
        req, {'type': 'put_checker',
              'data': {'ch': 0, 'p': 5, 'idx': 0}, 'history': True})
    await bg_server.backward_hist(1, sleep_sec=0)

    lines = read_lines(bg_server._storage.path)

    assert lines[0]['v'] == 2
    assert set(lines[0]['clock'].keys()) == {'limit', 'sw', 'clock'}
    # active は保存しない (再起動後は必ず止まった状態で始める)
    assert 'active' not in lines[0]['clock']
    assert [next(iter(ln)) for ln in lines[1:]] == ['h', 'f']
    assert lines[1]['h']['sn'] == 1
    assert lines[2]['f']['sn'] == 2
    # クロックは gameinfo に入っていない
    assert 'clock_limit' not in lines[1]['h']
    assert 'clock' not in lines[1]['h']['board']


async def test_running_clock_is_saved_stopped(
        bg_server, make_bg_server, req):
    """
    動作中のクロックも、読み込んだときは止まっている。

    サーバが落ちている間の時間は数えられないので、動作中のまま
    復元すると残り時間が実際とずれる。
    """
    await bg_server.on_json(
        req, {'type': 'set_player_clock',
              'data': {'player': 1, 'clock': [80, 5]}, 'history': False})
    await bg_server.on_json(
        req, {'type': 'start_clock', 'data': {'player': 1},
              'history': False})
    # 保存は履歴を積んだときに走る
    await bg_server.on_json(
        req, {'type': 'put_checker',
              'data': {'ch': 0, 'p': 5, 'idx': 0}, 'history': True})

    svr = make_bg_server()

    assert svr._clock.active == [False, False]
    # start_clock は猶予を limit[1] に戻すので、残るのは持ち時間の側
    assert svr._clock.clock[1][0] == 80


async def test_clock_switch_is_saved(bg_server, make_bg_server, req):
    """
    sw は保存して復元する (切ったまま再起動したら切れたまま)。

    クライアント (ytbg.js の apply_clock_sw()) は history: false で
    送るので、その形で確かめる。set_clock_switch の分岐で save_data() を
    呼ばないと、履歴が積まれず sw が残らない (TODO-024)。
    """
    await bg_server.on_json(
        req, {'type': 'set_clock_switch', 'data': {'switch': False},
              'history': False})

    svr = make_bg_server()

    assert svr._clock.sw is False


# ---------------------------------------------------------------------
# 読めないファイル
# ---------------------------------------------------------------------

def test_load_data_missing_file_returns_zero(tmp_path):
    """ファイルが無ければ (0, 0) 相当 (クロックは None)"""
    storage = Storage(tmp_path / 'not-exist.jsonl')

    assert storage.load() == ([], [], None)


@pytest.mark.parametrize(
    ('name', 'content'),
    [
        ('broken-json', b'{'),
        ('empty', b''),
        ('no-version', b'{"clock": {}}\n'),
        ('unknown-version', b'{"v": 99, "clock": {}}\n'),
        ('no-h-or-f', b'{"v": 2, "clock": {}}\n{"x": {}}\n'),
        ('invalid-utf8', b'{"v": 2, "clock": {}}\n{"h": [\xff]}\n'),
    ],
)
def test_load_broken_file_returns_nothing(tmp_path, name, content):
    """
    読めないファイルは空の履歴として始める (TODO-011)。

    例外を上へ抜けさせると、サーバが起動しなくなる。
    """
    path = tmp_path / f'{name}.jsonl'
    path.write_bytes(content)

    assert Storage(path).load() == ([], [], None)


@pytest.mark.parametrize(
    ('name', 'drop'),
    [
        ('sn', ('sn',)),
        ('server_version', ('server_version',)),
        ('game_num', ('game_num',)),
        ('match_score', ('match_score',)),
        ('score', ('score',)),
        ('turn', ('turn',)),
        ('resign', ('resign',)),
        ('board', ('board',)),
        ('playername', ('board', 'playername')),
        ('cube', ('board', 'cube')),
        ('cube-side', ('board', 'cube', 'side')),
        ('cube-value', ('board', 'cube', 'value')),
        ('cube-accepted', ('board', 'cube', 'accepted')),
        ('dice', ('board', 'dice')),
        ('checker', ('board', 'checker')),
    ],
)
def test_jsonl_missing_key_is_broken_file(tmp_path, name, drop):
    """
    .jsonl の履歴にキーが欠けていたら「壊れたファイル」として扱う。

    黙って既定値にすると、綴りを間違えた履歴が初期配置の盤面として
    読まれてしまう (TODO-024)。例外は LOAD_ERRORS で捕まり、
    履歴は空になる (＝サーバは起動する)。
    """
    ent = GameInfo(sn=1).to_dict()
    target = ent
    for key in drop[:-1]:
        target = target[key]
    del target[drop[-1]]

    path = tmp_path / f'missing-{name}.jsonl'
    path.write_text(
        json.dumps({'v': 2, 'clock': {}}) + '\n'
        + json.dumps({'h': ent}) + '\n')

    assert Storage(path).load() == ([], [], None)


def test_jsonl_misspelled_key_is_broken_file(tmp_path):
    """綴り違い (checker -> cheker) も「壊れたファイル」"""
    ent = GameInfo(sn=1).to_dict()
    ent['board']['cheker'] = ent['board'].pop('checker')

    path = tmp_path / 'misspelled.jsonl'
    path.write_text(
        json.dumps({'v': 2, 'clock': {}}) + '\n'
        + json.dumps({'h': ent}) + '\n')

    assert Storage(path).load() == ([], [], None)


def test_load_data_keeps_history_when_broken(bg_server):
    """読み込みに失敗したときは、サーバの履歴を書き換えない"""
    bg_server._storage.path.write_text('{')
    before = [h.to_dict() for h in bg_server._hist.entries]

    assert bg_server.load_data() == (0, 0)
    assert [h.to_dict() for h in bg_server._hist.entries] == before


# ---------------------------------------------------------------------
# 旧形式
# ---------------------------------------------------------------------

def test_old_format_is_read_when_no_jsonl(tmp_path):
    """.jsonl が無ければ旧形式 (.json) を読む"""
    storage = Storage(tmp_path / 'ytbg-test.jsonl')
    old_file(storage.old_path, history=[OLD_ENT], fwd_hist=[OLD_ENT])

    history, fwd_hist, clock = storage.load()

    assert len(history) == 1
    assert len(fwd_hist) == 1
    assert isinstance(history[0], GameInfo)
    assert history[0].score == [1, 3]
    assert history[0].board.playername == ['Alice', 'Bob']
    assert history[0].board.cube.value == 4
    assert clock is not None
    # 旧形式の clock_limit と board.clock が Clock の初期値になる
    assert clock.limit == [90, 9]
    assert clock.clock == [[50, 3], [40, 2]]
    assert clock.sw is True
    assert clock.active == [False, False]


def test_old_format_drops_clock_keys(tmp_path):
    """旧形式のエントリにある clock_limit と board.clock は読み捨てる"""
    storage = Storage(tmp_path / 'ytbg-test.jsonl')
    old_file(storage.old_path)

    history, _fwd_hist, _clock = storage.load()

    ent = history[0].to_dict()
    assert 'clock_limit' not in ent
    assert 'clock' not in ent['board']


def test_jsonl_wins_when_both_exist(tmp_path):
    """両方あれば .jsonl を読む"""
    storage = Storage(tmp_path / 'ytbg-test.jsonl')
    old_file(storage.old_path)
    storage.save([GameInfo(sn=1, score=[7, 7])], [], Clock(limit=[30, 3]))

    history, _fwd_hist, clock = storage.load()

    assert len(history) == 1
    assert history[0].score == [7, 7]
    assert clock is not None
    assert clock.limit == [30, 3]


def test_old_file_is_kept(tmp_path):
    """旧ファイルは消さない。書き戻しは .jsonl"""
    storage = Storage(tmp_path / 'ytbg-test.jsonl')
    old_file(storage.old_path)
    before = storage.old_path.read_text()

    history, fwd_hist, clock = storage.load()
    storage.save(history, fwd_hist, clock)

    assert storage.old_path.exists()
    assert storage.old_path.read_text() == before
    assert storage.path.exists()


async def test_server_starts_from_old_format(make_bg_server, tmp_path):
    """旧形式しか無くても、サーバはそれを読んで起動する"""
    old_file(tmp_path / 'ytbg-old.json')

    svr = make_bg_server('old')

    assert len(svr._hist.entries) == 1
    assert svr._gameinfo.board.playername == ['Alice', 'Bob']
    assert svr._clock.limit == [90, 9]
    assert svr._clock.clock == [[50, 3], [40, 2]]
##

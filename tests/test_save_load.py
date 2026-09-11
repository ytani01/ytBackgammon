#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_save_load.py

保存・読み込み (TODO-024) のテスト。

保存の形は JSON Lines (~/ytbg-{server_id}.jsonl)。1 行目がメタ
(形式のバージョンとクロック)、以降が履歴 (h) と進む側の履歴 (f) で、
書かれた順がスタックの順。

旧形式 (~/ytbg-{server_id}.json) の読み込みは TODO-031 で消した。
**残っている .json は読まないし、消しもしない。**
"""
import json

import pytest

from ytbg.clock import Clock
from ytbg.gameinfo import GameInfo
from ytbg.storage import Storage

# 旧形式 (TODO-024 より前) のファイルの中身。
# 読まなくなったことを確かめるテストで使う (TODO-031)
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


def old_file(path):
    """旧形式 (TODO-024 より前) のファイルを書く"""
    path.write_text(json.dumps({'history': [OLD_ENT], 'fwd_hist': []}))


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


async def test_set_clock_limit_is_saved(bg_server, req):
    """
    set_clock_limit はファイルに保存される (TODO-032)。

    クロック系は history: true で届いても履歴に積まない
    (NO_HISTORY_TYPES) ので、add_history() 経由の保存が効かない。
    _on_set_clock_limit() が自分で save_data() を呼んでいること
    (_on_set_clock_switch() と同じ理由)
    """
    await bg_server.on_json(
        req, {'type': 'set_clock_limit',
              'data': {'index': 0, 'clock_limit': 111}, 'history': True})

    lines = read_lines(bg_server._storage.path)

    assert lines[0]['clock']['limit'] == [111, bg_server._clock.limit[1]]


async def test_new_game_saves_clock_reset(bg_server, req):
    """
    New Game でのクロックのリセットもファイルに保存される (TODO-032)。

    盤面が既に初期配置のときは add_history() が積まないことがあり、
    そのときも new_game() 自身が保存すること。

    board を変えずに [10.0, 2.0] をファイルへ保存してから New Game を
    送る。board が初期配置のまま変わらないので、add_history() は
    積まない (履歴もまだ 1 件だけで進む側も空)。それでも New Game の
    あとは、ファイルの clock が limit に戻っていること
    """
    await bg_server.on_json(
        req, {'type': 'set_player_clock',
              'data': {'player': 0, 'clock': [10.0, 2.0]}, 'history': False})
    await bg_server.on_json(
        req, {'type': 'set_player_clock',
              'data': {'player': 1, 'clock': [10.0, 2.0]}, 'history': False})
    # board を変えずに、いまの clock ([10.0, 2.0]) をファイルへ保存する。
    # back (n=1) は、戻る先が無くても finally で必ず save_data() を呼ぶ
    await bg_server.on_json(
        req, {'type': 'back', 'data': {'n': 1}, 'history': False})

    lines = read_lines(bg_server._storage.path)
    assert lines[0]['clock']['clock'] == [[10.0, 2.0], [10.0, 2.0]]

    await bg_server.on_json(req, {'type': 'new', 'data': {}, 'history': False})

    lines = read_lines(bg_server._storage.path)
    limit = bg_server._clock.limit

    assert lines[0]['clock']['clock'] == [limit, limit]


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

    クライアント (board.js の apply_clock_sw()) は history: false で
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
# 旧形式 (読まない)
# ---------------------------------------------------------------------

def test_old_format_is_not_read_and_kept(tmp_path):
    """
    旧形式 (.json) は読まないし、消しもしない (TODO-031)。

    読むと空で始まり、書き戻しは .jsonl。旧ファイルは中身ごと残る。
    """
    storage = Storage(tmp_path / 'ytbg-test.jsonl')
    old_path = tmp_path / 'ytbg-test.json'
    old_file(old_path)
    before = old_path.read_text()

    history, fwd_hist, clock = storage.load()

    assert history == []
    assert fwd_hist == []
    assert clock is None

    storage.save([GameInfo(sn=1, score=[7, 7])], [], Clock(limit=[30, 3]))

    assert storage.path.exists()
    assert old_path.exists()
    assert old_path.read_text() == before


async def test_server_starts_with_only_old_format(make_bg_server, tmp_path):
    """旧形式しか無いときは、初期配置から始まる (TODO-031)"""
    old_file(tmp_path / 'ytbg-old.json')

    svr = make_bg_server('old')

    assert len(svr._hist.entries) == 1
    assert svr._gameinfo.board.playername == ['', '']
    assert svr._clock.limit == Clock().limit


##

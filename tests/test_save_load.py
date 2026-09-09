#
# (c) Yoichi Tanibayashi
#
"""
test_save_load.py
"""
import copy
import json

import pytest


def test_save_and_load_roundtrip(bg_server, tmp_path):
    """save_data() で書いた内容を load_data() で読み戻せる"""
    bg_server.add_history(bg_server._bg._gameinfo)
    path = str(tmp_path / 'roundtrip.json')
    bg_server.save_data(path)

    saved_history = copy.deepcopy(bg_server._history)

    bg_server._history = []
    bg_server._fwd_hist = []
    bg_server._bg._gameinfo = {}

    hist_len, fwd_len = bg_server.load_data(path)

    assert hist_len == len(saved_history)
    assert fwd_len == 0
    assert bg_server._history == saved_history
    assert bg_server._bg._gameinfo == saved_history[-1]


def test_load_data_missing_file_returns_zero(bg_server, tmp_path):
    """存在しないファイルを読ませると (0, 0) を返す"""
    path = str(tmp_path / 'not-exist.json')

    hist_len, fwd_len = bg_server.load_data(path)

    assert (hist_len, fwd_len) == (0, 0)


def test_hist_ent2str_format(bg_server):
    """
    hist_ent2str() の出力の形そのものを押さえる。

    保存の形式は TODO-009 で Starlette へ移すときも変えないと決めている。
    往復テスト (test_save_and_load_roundtrip) は書式が変わっても通って
    しまうので、こちらで固定する (TODO-011)。
    """
    h = {
        'sn': 12,
        'server_version': '0.80',
        'game_num': 3,
        'match_score': 5,
        'score': [1, 2],
        'turn': -1,
        'resign': 0,
        'clock_limit': [120, 12],
        'board': {
            'playername': ['田中 "太郎"', 'Bob\\Smith'],
            'clock': [[120, 12], [95, 3]],
            'cube': {'side': 1, 'value': 64, 'accepted': False},
            'dice': [[1, 2, 0, 0], [0, 0, 0, 0]],
            'checker': [[[6, 0], [8, 1]], [[19, 0], [1, 1]]],
        },
    }

    expected = (
        '    {\n'
        '      "sn": 12,\n'
        '      "server_version": "0.80",\n'
        '      "game_num": 3,\n'
        '      "match_score": 5,\n'
        '      "score": [1, 2],\n'
        '      "turn": -1,\n'
        '      "resign": 0,\n'
        '      "clock_limit": [120, 12],\n'
        '      "board": {\n'
        '        "playername": [\n'
        '          "\\u7530\\u4e2d \\"\\u592a\\u90ce\\"",\n'
        '          "Bob\\\\Smith"\n'
        '        ],\n'
        '        "clock": [[120, 12], [95, 3]],\n'
        '        "cube": { "side": 1, "value": 64, "accepted": false },\n'
        '        "dice": [[1, 2, 0, 0], [0, 0, 0, 0]],\n'
        '        "checker": [\n'
        '          [[6, 0], [8, 1]],\n'
        '          [[19, 0], [1, 1]] \n'
        '        ]\n'
        '      }\n'
        '    },\n'
    )

    assert bg_server.hist_ent2str(h) == expected


def test_hist_ent2str_is_valid_json(bg_server):
    """
    hist_ent2str() は文字列連結で JSON を組み立てている。
    末尾のカンマと改行を外したものが JSON として読めることを見る。
    """
    bg_server._bg._gameinfo['board']['playername'] = ['田中 "太郎"', 'Bob']
    j_str = bg_server.hist_ent2str(bg_server._bg._gameinfo)

    ent = json.loads(j_str.rstrip(',\n'))

    assert ent['board']['playername'] == ['田中 "太郎"', 'Bob']


@pytest.mark.parametrize(
    ('name', 'content'),
    [
        ('broken-json', b'{'),
        ('no-history-key', b'{"foo": 1}'),
        ('no-fwd-hist-key', b'{"history": []}'),
        ('invalid-utf8', b'{"history": [\xff]}'),
    ],
)
def test_load_data_broken_file_returns_zero(bg_server, tmp_path, name,
                                            content):
    """
    読めないファイルは (0, 0) を返し、空の履歴として始める (TODO-011)。

    例外を上へ抜けさせると __init__() 経由でサーバが起動しなくなる。
    """
    path = tmp_path / f'{name}.json'
    path.write_bytes(content)
    bg_server._history = [{'sn': 1}]
    bg_server._fwd_hist = [{'sn': 2}]

    assert bg_server.load_data(str(path)) == (0, 0)
    # 読み込みに失敗したときは、元の履歴を書き換えない
    assert bg_server._history == [{'sn': 1}]
    assert bg_server._fwd_hist == [{'sn': 2}]

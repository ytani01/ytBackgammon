#
# (c) 2020 Yoichi Tanibayashi
#
"""
test_gameinfo_ops.py

GameInfo の更新メソッド (TODO-025 で ytBackgammon から吸収した)。

引数は message.py の dataclass (TODO-038)。
"""

from ytbg.message import CubeData, DiceData, TurnData


def test_init_gameinfo_structure(bg):
    """GameInfo が主要な属性を持つ構造になっている"""
    gameinfo = bg
    assert gameinfo.turn == 2
    assert gameinfo.resign == -1
    assert len(gameinfo.board.checker) == 2
    assert len(gameinfo.board.checker[0]) == 15
    assert len(gameinfo.board.checker[1]) == 15
    # クロックは gameinfo の外 (TODO-024)
    assert not hasattr(gameinfo, 'clock_limit')
    assert not hasattr(gameinfo.board, 'clock')


def test_put_checker_derives_player_from_id(bg):
    """ch_id を 100 で割った商がプレーヤー、余りが index になる"""
    bg.put_checker(12, 5, 1)
    assert bg.board.checker[0][12] == [5, 1]

    bg.put_checker(101, 20, 0)
    assert bg.board.checker[1][1] == [20, 0]


def test_cube_and_dice(bg):
    """cube() と dice() が gameinfo を更新する"""
    bg.cube(CubeData(side=0, value=2, accepted=False))
    assert bg.board.cube.value == 2

    bg.dice(DiceData(player=1, dice=[3, 4, 0, 0]))
    assert bg.board.dice[1] == [3, 4, 0, 0]


def test_set_turn(bg):
    """set_turn() が turn と resign の両方を更新する"""
    bg.set_turn(TurnData(turn=0, resign=1))
    assert bg.turn == 0
    assert bg.resign == 1

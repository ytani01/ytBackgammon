#
# (c) 2020 Yoichi Tanibayashi
#
"""mylog.py

``loguru`` のグローバル logger に名前を付けて、名前ごとに水準を
変えられるようにする。

# ``getLogger`` と ``loggerInit`` の役割の違い

この 2 つは別の場所で・別の目的で呼ぶ。

| | ``getLogger(name)`` | ``loggerInit(debug)`` |
|---|---|---|
| 呼ぶ場所 | クラス本体（import 時） | CLI コマンドの先頭（実行時） |
| 呼ぶ回数 | クラス・モジュールごとに 1 回 | プロセスごとに 1 回 |
| すること | 名前タグを付ける | loguru 本体を設定する |
| 決まるもの | その名前の水準（``level`` を渡したとき） | 出力先と既定水準 |
| 呼ばないと | 名前付きの logger が無い | 出力先が無く、何も出ない |

``getLogger()`` は import 時、つまり ``loggerInit()`` より前に実行
される。名前ごとの水準は ``_levels`` に残るので、あとから
``loggerInit()`` を呼んでも上書きされない（``loggerInit()`` が
決めるのは、名前を指定していないログの既定水準だけ）。

# sample

```python
from .mylog import exmsg, getLogger, loggerInit


class Base:
    # クラス本体に置く（アンダースコア2つ）。__qualname__ はクラス名。
    __log = getLogger(__qualname__)

    def greet(self):
        self.__log.debug("Base.greet")


class Child(Base):
    # 子クラスは自分の名前・水準を別に持てる。
    __log = getLogger(__qualname__, "DEBUG")

    def greet(self):
        self.__log.debug("Child.greet")
        super().greet()  # ここは "Base" の名前・水準で出る


# クラスの無いモジュール（main など）は、モジュール先頭に置く。
_log = getLogger("main")


def main(debug: bool = False):
    loggerInit(debug=debug)
    _log.debug("start")

    try:
        Child().greet()
    except Exception as e:
        _log.error(exmsg(e))
```
"""

import sys
from typing import TextIO

from loguru import logger

LOG_FMT = (
    "<level>"
    "<white>{time:MM/DD HH:mm:ss}</white> "
    "{level.icon} {level} "
    "{file}<green>:</green>{line} "
    "{function}()<green>></green> "
    "<white>{message}</white>"
    "</level>"
)

# 名前ごとの水準（数値）。"" は既定水準。
_levels: dict[str, int] = {"": 0}


def setLevel(name: str, level: str | None = None) -> None:
    """名前ごとの水準を設定する。

    ``level`` を省略する（``None``）と、既定水準に戻す
    （``name`` のエントリを消す）。
    """
    if level is None:
        if name:
            _levels.pop(name, None)
        return
    _levels[name] = logger.level(level).no


def getLogger(name: str, level: str | None = None):
    """名前付きの logger を返す。

    クラス本体に 1 つ置いて使う
    （``__log = getLogger(__qualname__)``）。返り値は ``logger.bind()``
    した束縛オブジェクトで、``extra["log_name"]`` にこの名前が入る。
    ``level`` を渡すと、そのままこの名前の水準になる
    （``setLevel(name, level)`` を呼ぶのと同じ）。
    """
    if level is not None:
        setLevel(name, level)
    return logger.bind(log_name=name)


def logLevel(debug: bool = False) -> str:
    """ログの水準。``debug`` なら DEBUG、そうでなければ INFO。"""
    return "DEBUG" if debug else "INFO"


def _filter(record) -> bool:
    name = record["extra"].get("log_name", "")
    return record["level"].no >= _levels.get(name, _levels[""])


def loggerInit(debug: bool = False, out: TextIO = sys.stderr) -> None:
    """logger を初期化する

    各 CLI コマンドの先頭で 1 度だけ呼ぶ。名前ごとの水準は
    ``getLogger(name, level)`` や ``setLevel(name, level)`` で
    コードから指定する。

    Parameters
    ----------
    debug: bool
        デバッグ出力を出すか（既定の水準）
    out
        出力先。既定は標準エラー
    """
    logger.remove()
    _levels[""] = logger.level(logLevel(debug)).no
    logger.add(out, level=0, filter=_filter, format=LOG_FMT)


def exmsg(ex: Exception) -> str:
    """例外を 1 行の文字列にする（``ValueError: 使えない名前です`` の形）。"""
    return f"{type(ex).__name__}: {ex}"

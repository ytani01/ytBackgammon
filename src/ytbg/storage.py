#
# (c) Yoichi Tanibayashi
#
"""
storage.py

履歴とクロックの保存・読み込み (TODO-024)。

保存の形は JSON Lines (~/ytbg-{server_id}.jsonl)。1 行目がメタで、
以降が履歴。

    {"v": 2, "clock": {"limit": [120, 12], "sw": true, "clock": [...]}}
    {"h": {...gameinfo...}}
    {"f": {...gameinfo...}}

h が _history、f が _fwd_hist で、**書かれた順がスタックの順**。
1 行につき json.dumps() を 1 回呼ぶだけなので、gameinfo にキーを
足したときに保存側を直し忘れて落ちることが無くなる。

旧形式 (~/ytbg-{server_id}.json) は **.jsonl が無いときだけ** 読む。
**旧ファイルは消さない。書き戻しは常に .jsonl。**
消すのは別項目 (TODO-031)。
"""
__author__ = 'Yoichi Tanibayashi'
__date__ = '2026/09'

import json
from pathlib import Path
from typing import Any

from .clock import Clock
from .gameinfo import GameInfo
from .mylog import getLogger

# 読み込みで拾う例外。読めない・壊れている・キーが足りないファイルは
# 空の履歴として始める (TODO-011)。例外を上へ抜けさせると、
# サーバが起動しなくなる
# 旧 load_data() と同じ範囲 + lines[0] のための IndexError。
# TypeError / AttributeError / ValueError まで握ると、gameinfo.py 側の
# 書き間違いを「壊れたファイル」として黙って握りつぶしてしまう (TODO-024)
LOAD_ERRORS = (OSError, UnicodeDecodeError, json.JSONDecodeError,
               KeyError, IndexError)

# 読み込みの結果 (履歴、進む側の履歴、クロック)。
# クロックは、読めなかったときだけ None
LoadResult = tuple[list[GameInfo], list[GameInfo], Clock | None]


class Storage:
    """JSON Lines のファイルと、旧形式の読み込み"""

    FORMAT_VERSION = 2

    __log = getLogger(__qualname__)

    def __init__(self, path):
        """
        Parameters
        ----------
        path: str | Path
            JSON Lines のファイル (.jsonl)。旧形式のパスは、
            拡張子を .json に替えたもの
        """
        self.path = Path(path)
        self.old_path = self.path.with_suffix('.json')
        self.__log.debug('path={}, old_path={}', self.path, self.old_path)

    def save(self, history, fwd_hist, clock) -> bool:
        """
        Parameters
        ----------
        history: list[GameInfo]
        fwd_hist: list[GameInfo]
        clock: Clock

        Returns
        -------
        bool
            書けたかどうか
        """
        lines = [
            {'v': self.FORMAT_VERSION, 'clock': clock.to_dict()},
        ]
        lines += [{'h': h.to_dict()} for h in history]
        lines += [{'f': h.to_dict()} for h in fwd_hist]

        j_str = ''.join(
            json.dumps(line, ensure_ascii=False) + '\n' for line in lines)

        try:
            # ensure_ascii=False で日本語をそのまま書くので、
            # encoding を指定しないとロケール依存になる (TODO-024)
            with self.path.open('w', encoding='utf-8') as f:
                f.write(j_str)
        except OSError as e:
            self.__log.warning('{}:{}.', type(e).__name__, e)
            return False

        return True

    def load(self) -> LoadResult:
        """
        保存したものを読む。

        .jsonl があればそれを読み、無いときだけ旧形式 (.json) を読む。
        どちらも読めなければ ([], [], None)。
        """
        if self.path.exists():
            return self._load_jsonl()

        if self.old_path.exists():
            self.__log.info('{}: load old format', self.old_path)
            return self._load_old()

        self.__log.warning('{}: no data file', self.path)
        return [], [], None

    def _load_jsonl(self) -> LoadResult:
        """JSON Lines を読む"""
        try:
            # 書き込みと同じく utf-8 で読む (TODO-024)
            with self.path.open(encoding='utf-8') as f:
                lines = [ln for ln in (raw.strip() for raw in f) if ln]

            meta = json.loads(lines[0])
            if meta['v'] != self.FORMAT_VERSION:
                self.__log.warning('v={}: unknown format version', meta['v'])
                return [], [], None

            clock = Clock.from_dict(meta.get('clock') or {})

            history: list[GameInfo] = []
            fwd_hist: list[GameInfo] = []
            for ln in lines[1:]:
                ent = json.loads(ln)
                # strict=True: キーが欠けた履歴は「壊れたファイル」
                # として扱う (LOAD_ERRORS の KeyError に落ちる)
                if 'h' in ent:
                    history.append(
                        GameInfo.from_dict(ent['h'], strict=True))
                elif 'f' in ent:
                    fwd_hist.append(
                        GameInfo.from_dict(ent['f'], strict=True))
                else:
                    raise KeyError('h/f')

        except LOAD_ERRORS as e:
            self.__log.warning('{}:{}.', type(e).__name__, e)
            return [], [], None

        self.__log.debug('history=({}), fwd_hist=({})',
                         len(history), len(fwd_hist))
        return history, fwd_hist, clock

    def _load_old(self) -> LoadResult:
        """
        旧形式 (TODO-024 より前) を読む。

        clock_limit と board.clock は gameinfo から外したので、
        **履歴の最後のエントリの値を Clock の初期値にする**。
        sw は既定 (True)。各エントリに残っているクロックのキーは
        GameInfo.from_dict() が読み捨てる。
        """
        try:
            # 旧形式は ensure_ascii=True で書かれているので中身は
            # ASCII だが、読み方を揃える (TODO-024)
            with self.old_path.open(encoding='utf-8') as f:
                data = json.load(f)

            raw_history = data['history']
            raw_fwd_hist = data['fwd_hist']
            history = [GameInfo.from_dict(h) for h in raw_history]
            fwd_hist = [GameInfo.from_dict(h) for h in raw_fwd_hist]
            clock = self._old_clock(raw_history)

        except LOAD_ERRORS as e:
            self.__log.warning('{}:{}.', type(e).__name__, e)
            return [], [], None

        self.__log.debug('history=({}), fwd_hist=({})',
                         len(history), len(fwd_hist))
        return history, fwd_hist, clock

    def _old_clock(self, raw_history: list[dict[str, Any]]) -> Clock:
        """旧形式の最後のエントリから Clock を作る"""
        if not raw_history:
            return Clock()

        last = raw_history[-1]
        return Clock(
            limit=last.get('clock_limit'),
            clock=(last.get('board') or {}).get('clock'),
        )
##

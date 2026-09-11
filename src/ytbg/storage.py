#
# (c) 2020 Yoichi Tanibayashi
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

旧形式 (~/ytbg-{server_id}.json) の読み込みは TODO-031 で消した。
**残っている .json は読まないし、消しもしない。**
"""

import json
from pathlib import Path

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
    """JSON Lines のファイルの保存・読み込み"""

    FORMAT_VERSION = 2

    __log = getLogger(__qualname__)

    def __init__(self, path):
        """
        Parameters
        ----------
        path: str | Path
            JSON Lines のファイル (.jsonl)
        """
        self.path = Path(path)
        self.__log.debug('path={}', self.path)

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

        読めなければ ([], [], None)。
        """
        if not self.path.exists():
            self.__log.warning('{}: no data file', self.path)

            # 旧形式しか無いボードは初期配置から始まる。黙って始めると
            # 「消えた」ようにしか見えないので、あることだけは知らせる
            # (TODO-031)
            old_path = self.path.with_suffix('.json')
            if old_path.exists():
                self.__log.warning('{}: old format is not read anymore',
                                   old_path)

            return [], [], None

        return self._load_jsonl()

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

##

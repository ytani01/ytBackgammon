#
# (c) Yoichi Tanibayashi
#
"""
ytBackgammon
"""

from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

__author__ = 'Yoichi Tanibayashi'

# パッケージに同梱した webroot (templates/, static/)。
# __main__.py が static/、yt_backgammon_server.py が templates/ を使う
# ので、1 箇所にまとめてある (TODO-009)
WEBROOT = Path(__file__).absolute().parent / 'webroot'

if __package__:
    try:
        __version__ = version(__package__)
    except PackageNotFoundError:
        __version__ = '0.0.0'
else:
    __version__ = '_._._'

__prog_name__ = 'ytBackgammon Server'

__all__ = [
    'WEBROOT',
    '__author__',
    '__prog_name__',
    '__version__',
]

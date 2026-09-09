#
# (c) Yoichi Tanibayashi
#
"""
ytBackgammon
"""

from importlib.metadata import PackageNotFoundError, version

__author__ = 'Yoichi Tanibayashi'

if __package__:
    try:
        __version__ = version(__package__)
    except PackageNotFoundError:
        __version__ = '0.0.0'
else:
    __version__ = '_._._'

__prog_name__ = 'ytBackgammon Server'

__all__ = [
    '__author__',
    '__prog_name__',
    '__version__',
]

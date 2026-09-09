#!/usr/bin/env python3
#
# (c) 2019 Yoichi Tanibayashi
#
"""
MyLogger.py

Usage:
--
from MyLogger import get_logger, DEBUG, INFO, WARNING, ERROR, CRITICAL

class A:
    _log = get_logger(__name__, False)

    def __init__(self, a, debug=False)
        self.debug = debug
        __class__.logger = get_logger(__class__.__name__, self.debug)
        self.logger.debug('a=%s', a)

class B:
    _log = get_logger(__name__, False)

    def __init__(self, a, debug=INFO)
        self.debug = debug
        __class__.logger = get_logger(__class__.__name__, self.debug)
        self.logger.debug('a=%s', a)

def main(debug):
    _log = get_logger(__name__, debug)
    _log.debug('')

--

"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020/03/31'

from logging import getLogger, StreamHandler, Formatter
from logging import NOTSET, DEBUG, INFO, WARNING, ERROR, CRITICAL


class MyLogger:
    def __init__(self, name=''):
        fmt_hdr = '%(asctime)s %(levelname)s '
        fmt_loc = '%(filename)s.%(name)s.%(funcName)s:%(lineno)d> '
        self.handler_fmt = Formatter(fmt_hdr + fmt_loc + '%(message)s',
                                     datefmt='%H:%M:%S')

        self.console_handler = StreamHandler()
        self.console_handler.setLevel(DEBUG)
        self.console_handler.setFormatter(self.handler_fmt)

        self.logger = getLogger(name)
        self.logger.setLevel(INFO)
        self.logger.addHandler(self.console_handler)
        self.logger.propagate = False

    def get_logger(self, name, debug):
        logger = self.logger.getChild(name)
        if debug in (NOTSET, DEBUG, INFO, WARNING, ERROR, CRITICAL):
            logger.setLevel(debug)
        elif type(debug) == int:
            logger.setLevel(debug)
        elif debug:
            logger.setLevel(DEBUG)
        else:
            logger.setLevel(INFO)
        return logger


myLogger = MyLogger()


def get_logger(name, debug):
    return myLogger.get_logger(name, debug)

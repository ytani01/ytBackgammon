#!/usr/bin/env python3
#
# (c) 2020 Yoichi Tanibayashi
#
"""
Description
"""
__author__ = 'Yoichi Tanibayashi'
__date__   = '2020'

import subprocess
import threading
import queue
import time
import base64
from MyLogger import get_logger
import click
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])


class GnuBG:
    CMDLINE = ['gnubg', '-t']

    _log = get_logger(__name__, False)

    def __init__(self, opt, debug=False):
        self._dbg = debug
        __class__._log = get_logger(__class__.__name__, self._dbg)
        self._log.debug('opt=%s', opt)

        self._opt = opt

        self._proc = None
        self._th_out = threading.Thread(target=self.print_output, daemon=True)

        self._activate = False

    def run(self):
        self._log.debug('')

        self._proc = subprocess.Popen(self.CMDLINE, encoding='UTF-8',
                                      stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE)
        self._th_out.start()

        self._activate = True

        while self._activate:
            try:
                line1 = input('> ')
                self._log.info('line1=%a', line1)
                print(line1, file=self._proc.stdin, flush=True)
                
            except EOFError as e:
                self._log.warning('EOF!')

                print('quit', file=self._proc.stdin, flush=True)
                self._activate = False
                break
            
            except Exception as e:
                msg = '%s:%s.' % (type(e).__name__, e)
                self._log.warning(msg)
                
        self._log.debug('done')

    def print_output(self):
        self._log.debug('')

        while self._activate:
            line1 = self._proc.stdout.readline()
            print(line1, end='')
            
            if 'Position ID:' in line1:
                posid = line1[30:-1]
                print('> \'%s\'' % posid)

                self.decode_posid(posid)

            time.sleep(0.1)

        self._log.warning('done')

    @classmethod
    def decode_posid(cls, posid):
        cls._log.debug('posid=%s', posid)

        posid_data = (posid + '==').encode('utf-8')
        cls._log.debug('posid_data=%a', posid_data)

        b64data = base64.b64decode(posid_data)
        cls._log.debug('b64data=%a', b64data)
        
        binstr = ''.join([('00000000'+bin(d)[2:])[::-1][:8] for d in b64data])
        cls._log.debug('binstr=%s', binstr)

        binstr1 = binstr[:25]
        binstr2 = binstr[25:]

        pos0 = []
        i = 0
        pos0.append('')
        for j in range(len(binstr)):
            ch = binstr[j]
            pos0[i] += ch

            if ch == '0':
                i += 1
                if i >= 50:
                    break
                pos0.append('')

        pos = []
        pos.append(pos0[:25])
        pos.append(pos0[25:])
                
        for i, p in enumerate(pos[0]):
            if i % 6 == 0:
                cls._log.info('')
            cls._log.info('[%02d]%s', i+1, p)

        cls._log.info('')

        for i, p in enumerate(pos[1]):
            if i % 6 == 0:
                cls._log.info('')
            cls._log.info('[%02d]%s', i+1, p)


class SampleApp:
    _log = get_logger(__name__, False)

    def __init__(self, arg, opt, debug=False):
        self._dbg = debug
        __class__._log = get_logger(__class__.__name__, self._dbg)
        self._log.debug('arg=%s, opt=%s', arg, opt)

        self._arg = arg
        self._opt = opt

        self.bg = GnuBG(opt, debug=self._dbg)

    def main(self):
        self._log.debug('')

        self.bg.run()
        # self.bg.decode_posid(self._arg[0])

        self._log.debug('done')

    def end(self):
        self._log.debug('')

        self._log.debug('done')


@click.command(context_settings=CONTEXT_SETTINGS, help='''
Description
''')
@click.argument('arg', type=str, nargs=-1)
@click.option('--opt', '-o', 'opt', type=str, default='def_value',
              help='sample option')
@click.option('--debug', '-d', 'debug', is_flag=True, default=False,
              help='debug flag')
def main(arg, opt, debug):
    _log = get_logger(__name__, debug)
    _log.debug('arg=%s, opt=%s', arg, opt)

    app = SampleApp(arg, opt, debug=debug)
    try:
        app.main()
    finally:
        _log.debug('finally')
        app.end()


if __name__ == '__main__':
    main()

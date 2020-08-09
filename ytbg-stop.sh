#!/bin/sh
#
# (c) Yoichi Tanibayashi
#
MYNAME=`basename $0`

PIDS=`ps auxwww | grep 'python.*ytbg.py' | grep -v grep | grep -v bin | sed 's/  */:/g' | cut -d: -f 2`

for p in $PIDS; do
    echo $p
    kill $p
done

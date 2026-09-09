#!/bin/sh
#
# (c) Yoichi Tanibayashi
#
MYNAME=`basename $0`

# uv でインストールした実行ファイル (.venv/bin/ytbg) を python が動かす。
# grep 自身を拾わないように、パターンの先頭 1 文字を [] で囲む
PIDS=`ps auxwww | grep 'python.*/bin/[y]tbg' | sed 's/  */:/g' | cut -d: -f 2`

for p in $PIDS; do
    echo $p
    kill $p
done

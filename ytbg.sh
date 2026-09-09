#!/bin/sh
#
# (c) Yoichi Tanibayashi
#
# usage: ytbg.sh [-d] [-p port] [-i image_dir] server_id
#
MYDIR=`dirname $0`

cd "${MYDIR}" || exit 1

exec uv run ytbg "$@"

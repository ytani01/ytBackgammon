#!/bin/sh
#
# (c) Yoichi Tanibayashi
#
# usage: ytbg.sh board [-d] [-p port] [-i image_dir] server_id
#        ytbg.sh lobby [-d] [-p port] [-c ytbg.toml]
#
MYDIR=`dirname $0`

cd "${MYDIR}" || exit 1

exec uv run ytbg "$@"

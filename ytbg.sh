#!/bin/sh
#
# (c) Yoichi Tanibayashi
#
MYNAME=`basename $0`
VENVDIR="$1"

usage() {
    echo
    echo "usage: ${MYNAME} venv_dir arg .."
    echo
}

if [ -z "${VENVDIR}" ]; then
    usage
    exit 1
fi

if [ ! -d ${VENVDIR} ]; then
    usage
    exit 1
fi
shift

APPSUBDIR="ytBackgammon/app"
CMD="ytbg.py"
ARGS="$*"

#
# include commonlib.sh
#
. ${VENVDIR}/${APPSUBDIR}/commonlib.sh

tsecho ${MYNAME} "MYNAME=${MYNAME}"
tsecho ${MYNAME} "APPSUBDIR=${APPSUBDIR}"
tsecho ${MYNAME} "CMD=${CMD}"
tsecho ${MYNAME} "ARGS=${ARGS}"

#
# activate venv
#
activatevenv ${VENVDIR}

#
# execute CMD
#

tsechoeval ${MYNAME} cd ${VIRTUAL_ENV}/${APPSUBDIR}
tsechoeval ${MYNAME} ./${CMD} ${ARGS}

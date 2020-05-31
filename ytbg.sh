#!/bin/sh
#
# (c) Yoichi Tanibayashi
#
MYNAME=`basename $0`
VENVDIR="$1"

#
# tsecho {header_str} {str}
#
tsecho () {
    _HEADER=$1
    shift
    _STR=$*
    
    _DATESTR=`LANG=C date +'%Y/%m/%d(%a) %H:%M:%S'`
    echo "${_DATESTR} ${_HEADER}> $*"
}

#
# tsechoeval {header_string} {command_line}
#
tsechoeval () {
    _HEADER=$1
    shift
    _CMDLINE=$*
    tsecho ${_HEADER} ${_CMDLINE}

    eval $_CMDLINE
    _RESULT=$?

    if [ $_RESULT -ne 0 ]; then
        tsecho ${_HEADER} "ERROR:\$?=$_RESULT:$_CMDLINE" >&2
    fi
    return $_RESULT
}

#
# activateenv [env_dir]
#
activatevenv () {
    _MYNAME=`basename $0`
    _PWD0=`pwd`
    # tsecho $0 "_PWD0=$_PWD0"

    if [ $# -gt 1 ]; then
        tsecho ${_MYNAME} "ERROR: too many arguments" >&2
        tsecho ${_MYNAME} "" >&2
        tsecho ${_MYNAME} "    usage: ${_MYNAME} [env_dir]" >&2
        tsecho ${_MYNAME} "" >&2
        return 1
    fi

    _VENVDIR=`pwd`

    if [ ! -z $1 ]; then
        _VENVDIR=$1

        tsechoeval ${_MYNAME} cd $_VENVDIR
        _RESULT=$?
        if [ $_RESULT -ne 0 ]; then
            return $_RESULT
        fi
    fi

    while [ ! -f ./bin/activate ]; do
        cd ..

        _VENVDIR=`pwd`
        tsecho ${_MYNAME} "_VENVDIR=${_VENVDIR}" >&2

        if [ $_VENVDIR = "/" ]; then
            tsecho ${_MYNAME} "ERROR: './bin/activate': no such file" >&2
            cd ${_PWD0}
            return 1
        fi
    done

    # tsecho ${_MYNAME} "_VENVDIR=$_VENVDIR"

    if [ ! -z "${VIRTUAL_ENV}" ]; then
        tsecho ${_MYNAME} "deactivate (VIRTUAL_ENV=${VIRTUAL_ENV})"
        deactivate
    fi

    tsechoeval ${_MYNAME} . ./bin/activate
    tsecho ${_MYNAME} "VIRTUAL_ENV=${VIRTUAL_ENV}"

    cd "$_PWD0"
    # tsecho ${_MYNAME} `pwd`
}

#
# usage
#
usage() {
    echo
    echo "usage: ${MYNAME} venv_dir arg .."
    echo
}

#
# main
#
if [ -z "${VENVDIR}" ]; then
    usage
    exit 1
fi

if [ ! -d ${VENVDIR} ]; then
    usage
    exit 1
fi
shift

APPSUBDIR="ytBackgammon"
CMD="ytbg.py"
ARGS="$*"

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

#!/bin/sh
#
# (c) Yoichi Tanibayashi
#
MYNAME=`basename $0`

CMDS="ytbg.sh"

cd `dirname $0`
MYDIR=`pwd`

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

tsecho ${MYNAME} "MYNAME=${MYNAME}"
tsecho ${MYNAME} "MYDIR=${MYDIR}"

#
# activate venv
#
cd ..
VENVDIR=`pwd`
tsecho ${MYNAME} "VENVDIR=${VENVDIR}"

activatevenv ${VENVDIR}

#
# install CMDS
#
BINDIR=${HOME}/bin
tsecho ${MYNAME} "BINDIR=${BINDIR}"

if [ -d ${BINDIR} ]; then
    mkdir -pv ${BINDIR}
fi

tsechoeval ${MYNAME} cd ${BINDIR}
tsecho ${MYNAME} "pwd -->" `pwd`
for f in ${CMDS}; do
    ln -sfv ${MYDIR}/${f} .
done

#
# pip install
#
tsechoeval ${MYNAME} cd ${MYDIR}
tsecho ${MYNAME} "pwd -->" `pwd`
tsechoeval ${MYNAME} pip install -r requirements.txt

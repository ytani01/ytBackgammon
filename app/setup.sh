#!/bin/sh
#
# (c) Yoichi Tanibayashi
#
MYNAME=`basename $0`

CMDS="ytbg.sh"

#
# include commonlib.sh 
#
cd `dirname $0`
MYDIR=`pwd`

. ./commonlib.sh

tsecho ${MYNAME} "MYNAME=${MYNAME}"
tsecho ${MYNAME} "MYDIR=${MYDIR}"

#
# activate venv
#
cd ../..
VENVDIR=`pwd`
tsecho ${MYNAME} "VENVDIR=${VENVDIR}"

activatevenv ${VENVDIR}

BINDIR=${VIRTUAL_ENV}/bin
tsecho ${MYNAME} "BINDIR=${BINDIR}"

#
# install CMDS
#
tsechoeval ${MYNAME} cd ${BINDIR}
tsecho ${MYNAME} `pwd`
for f in ${CMDS}; do
    ln -sfv ${MYDIR}/${f} .
done

#
# pip install
#
tsechoeval ${MYNAME} cd ${MYDIR}
tsechoeval ${MYNAME} pip install -r requirements.txt

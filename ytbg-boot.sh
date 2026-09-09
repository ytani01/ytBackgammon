#!/bin/sh
#
# (c) Yoichi Tanibayashi
#
MYDIR=`dirname $0`

images="images2 images0a images1a images3"

for i in 1 2 3 4; do
    _port=`expr 5000 + $i`
    _images=`echo $images | cut -d ' ' -f $i`
    "${MYDIR}"/ytbg.sh -d -p $_port -i $_images $i &
done

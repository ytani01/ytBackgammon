#!/bin/sh
#
MYNAME=`basename $0`
images="images2 images0a images1a images3"

VENVDIR="$HOME/env0-ytbg"

for i in 1 2 3 4; do
    _port=`expr 5000 + $i`
    _images=`echo $images | cut -d ' ' -f $i`
    ytbg.sh $VENVDIR -d -p $_port -i $_images $i &
done

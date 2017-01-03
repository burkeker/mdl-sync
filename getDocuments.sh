#!/bin/bash

LOGFILE=/var/log/mendeley/documentRetrieval.log
touch $LOGFILE
cat /dev/null > $LOGFILE

exec 2> >(perl -pe '$x=`date "+%d %b %Y %H:%M %p"`;chomp($x);$_=$x." ".$_' >/var/log/mendeley/documentRetrieval.log)

STARTTIME=$(date +%s)
node app.js &
casperjs authenticate.js

ENDTIME=$(date +%s)
echo "It takes $(($ENDTIME - $STARTTIME)) seconds to complete Mendeley document retrieval."
(>&2 echo "It takes $(($ENDTIME - $STARTTIME)) seconds to complete Mendeley document retrieval.")

#!/bin/bash

node app.js & export PID=$!
casperjs authenticate.js
kill $PID
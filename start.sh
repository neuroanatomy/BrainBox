#!/bin/bash

cd /brainbox
mkdir -p public
mkdir -p public/data
npm install
node ./bin/www

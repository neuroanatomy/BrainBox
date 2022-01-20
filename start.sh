#!/bin/bash
cd /brainbox || exit
npm install
npm run build
node ./bin/www

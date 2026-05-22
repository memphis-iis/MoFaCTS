#!/bin/bash

set -o errexit

printf "\n[-] Installing Meteor application server NPM dependencies...\n\n"

cd $APP_BUNDLE_FOLDER/bundle/programs/server/
if [ -f package-lock.json ]; then
	npm ci
else
	npm install
fi

if [[ "$1" = '--build-from-source' ]]; then
	npm rebuild --build-from-source
	cd $APP_BUNDLE_FOLDER/bundle/programs/server/npm
	npm rebuild --build-from-source
fi

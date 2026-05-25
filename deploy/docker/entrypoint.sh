#!/bin/bash

set -o errexit

cd $SCRIPTS_FOLDER

if [ -x ./startup.sh ]; then
	source ./startup.sh
fi

# Fail fast if deploy points at any Mongo database other than the canonical one.
source ./validate-mongo-url.sh

# Poll until we can successfully connect to MongoDB.
source ./connect-to-mongo.sh

echo 'Starting app...'

: "${METEOR_SETTINGS_WORKAROUND:?METEOR_SETTINGS_WORKAROUND is required}"
if [ ! -f "$METEOR_SETTINGS_WORKAROUND" ]; then
	echo "Meteor settings file not found: $METEOR_SETTINGS_WORKAROUND" >&2
	exit 1
fi
export METEOR_SETTINGS_WORKAROUND

cd $APP_BUNDLE_FOLDER/bundle

exec "$@"

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

# Prefer the compose-provided settings path and fall back to the baked-in copy.
export METEOR_SETTINGS_WORKAROUND=${METEOR_SETTINGS_WORKAROUND:-/app/settings.json}

cd $APP_BUNDLE_FOLDER/bundle

exec "$@"

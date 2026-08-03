#!/bin/bash

set -o errexit

cd $SCRIPTS_FOLDER

if [ -x ./startup.sh ]; then
	source ./startup.sh
fi

# Require the opaque connection inputs before handing them to the MongoDB driver.
source ./validate-mongo-url.sh

# Validate the live connection, selected database, topology, and authentication.
source ./connect-to-mongo.sh

echo 'Starting app...'

: "${METEOR_SETTINGS_FILE:?METEOR_SETTINGS_FILE is required}"
if [ ! -f "$METEOR_SETTINGS_FILE" ]; then
	echo "Meteor settings file not found: $METEOR_SETTINGS_FILE" >&2
	exit 1
fi
export METEOR_SETTINGS="$(cat "$METEOR_SETTINGS_FILE")"

cd $APP_BUNDLE_FOLDER/bundle

exec "$@"

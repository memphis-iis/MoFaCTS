#!/usr/bin/env bash
set -Eeuo pipefail

readonly keyfile_source='/run/secrets/mongodb-keyfile-source'
readonly keyfile_target='/data/configdb/mongodb-keyfile'

if [[ ! -s "$keyfile_source" ]]; then
  echo >&2 'MongoDB replica-set keyfile is missing or empty.'
  exit 1
fi

install -o mongodb -g mongodb -m 400 "$keyfile_source" "$keyfile_target"
exec /usr/local/bin/docker-entrypoint.sh mongod "$@"

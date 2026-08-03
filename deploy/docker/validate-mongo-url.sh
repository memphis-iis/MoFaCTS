#!/bin/bash

set -o errexit

if [ -z "${MONGO_URL:-}" ]; then
  echo "MONGO_URL is required." >&2
  exit 1
fi

if [ -z "${EXPECTED_MONGO_DB_NAME:-}" ]; then
  echo "EXPECTED_MONGO_DB_NAME is required." >&2
  exit 1
fi

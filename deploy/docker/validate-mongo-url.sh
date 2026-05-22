#!/bin/bash

set -o errexit

EXPECTED_MONGO_DB_NAME="${EXPECTED_MONGO_DB_NAME:-MoFACT-meteor3}"

if [ -z "${MONGO_URL:-}" ]; then
  echo "MONGO_URL is required and must target the ${EXPECTED_MONGO_DB_NAME} database." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to validate MONGO_URL before startup." >&2
  exit 1
fi

ACTUAL_MONGO_DB_NAME="$(
  node <<'EOJS'
const rawUrl = process.env.MONGO_URL;

try {
  const parsedUrl = new URL(rawUrl);
  const pathname = (parsedUrl.pathname || '').replace(/^\/+/, '');

  if (!pathname || pathname.includes('/')) {
    throw new Error('MONGO_URL must include exactly one database name in the path segment.');
  }

  process.stdout.write(decodeURIComponent(pathname));
} catch (error) {
  console.error(`Invalid MONGO_URL: ${error.message}`);
  process.exit(1);
}
EOJS
)"

if [ "$ACTUAL_MONGO_DB_NAME" != "$EXPECTED_MONGO_DB_NAME" ]; then
  echo "MONGO_URL points to '${ACTUAL_MONGO_DB_NAME}', but deploys must use '${EXPECTED_MONGO_DB_NAME}'." >&2
  exit 1
fi

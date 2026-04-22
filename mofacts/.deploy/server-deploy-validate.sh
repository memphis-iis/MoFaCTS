#!/usr/bin/env bash
set -euo pipefail

# Image-based deployment validator for server runtime.
# Intended to run from /var/www/mofacts on the server.

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yaml}"
SERVICE_NAME="${SERVICE_NAME:-mofacts}"
WAIT_SECONDS="${WAIT_SECONDS:-45}"

TARGET_IMAGE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      TARGET_IMAGE="${2:-}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --service)
      SERVICE_NAME="${2:-}"
      shift 2
      ;;
    --wait-seconds)
      WAIT_SECONDS="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd docker

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin not available" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

PREV_IMAGE="$(docker inspect "$SERVICE_NAME" --format '{{.Config.Image}}' 2>/dev/null || true)"
if [[ -z "$PREV_IMAGE" ]]; then
  echo "Warning: existing container '$SERVICE_NAME' not found; rollback image unavailable."
fi

if [[ -z "$TARGET_IMAGE" ]]; then
  TARGET_IMAGE="$PREV_IMAGE"
fi

if [[ -z "$TARGET_IMAGE" ]]; then
  echo "No target image resolved. Pass --image <repo:tag>." >&2
  exit 1
fi

echo "Deploy target image: $TARGET_IMAGE"
echo "Compose file: $COMPOSE_FILE"
echo "Service: $SERVICE_NAME"

echo "Pulling target image..."
docker pull "$TARGET_IMAGE"

OVERRIDE_FILE="$(mktemp /tmp/mofacts-override.XXXXXX.yaml)"
cleanup() {
  rm -f "$OVERRIDE_FILE"
}
trap cleanup EXIT

cat > "$OVERRIDE_FILE" <<EOF
services:
  $SERVICE_NAME:
    image: $TARGET_IMAGE
EOF

echo "Validating composed config..."
docker compose -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" config >/dev/null

echo "Applying deployment..."
docker compose -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" up -d --no-deps "$SERVICE_NAME"

echo "Waiting up to ${WAIT_SECONDS}s for running state..."
deadline=$((SECONDS + WAIT_SECONDS))
running="false"
while (( SECONDS < deadline )); do
  status="$(docker inspect "$SERVICE_NAME" --format '{{.State.Status}}' 2>/dev/null || true)"
  if [[ "$status" == "running" ]]; then
    running="true"
    break
  fi
  sleep 2
done

if [[ "$running" != "true" ]]; then
  echo "Deployment failed: service did not reach running state." >&2
  docker logs --tail 120 "$SERVICE_NAME" || true

  if [[ -n "$PREV_IMAGE" && "$PREV_IMAGE" != "$TARGET_IMAGE" ]]; then
    echo "Attempting rollback to previous image: $PREV_IMAGE"
    cat > "$OVERRIDE_FILE" <<EOF
services:
  $SERVICE_NAME:
    image: $PREV_IMAGE
EOF
    docker compose -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" up -d --no-deps "$SERVICE_NAME" || true
  fi
  exit 1
fi

echo "Deployment succeeded. Current container image:"
docker inspect "$SERVICE_NAME" --format '{{.Config.Image}}'
echo "Container status:"
docker inspect "$SERVICE_NAME" --format '{{.State.Status}}'

echo "Recent logs:"
docker logs --tail 120 "$SERVICE_NAME" || true

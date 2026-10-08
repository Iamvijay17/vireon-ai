#!/usr/bin/env bash
# Lightweight compose integration test, run by CI (docker job) and runnable
# locally. Starts ONLY redis + a throwaway mongo + the backend and frontend
# images, waits for their Docker health checks, then checks the real HTTP
# surface through nginx. No AI / GPU / MinIO services are started.
#
#   SMOKE_COMMIT=<sha>   if set, /api/version must report this commit (first 7 chars)
#   SMOKE_PROJECT=<name> compose project name (default vireon-ci). Never use "vireon":
#                        that is the production project on the Windows server.
#   SMOKE_OWNER/SMOKE_TAG  image owner/tag to run (default ci/ci => ghcr.io/ci/vireon-*:ci)
#
# The images must already exist locally (CI builds them with `load: true`).
set -euo pipefail

cd "$(dirname "$0")/../.."
PROJECT="${SMOKE_PROJECT:-vireon-ci}"
PORT=18080
BASE="http://127.0.0.1:${PORT}"

ENV_FILE="$(mktemp)"
cat > "$ENV_FILE" <<ENVEOF
GHCR_OWNER=${SMOKE_OWNER:-ci}
IMAGE_TAG=${SMOKE_TAG:-ci}
PUBLIC_URL=${BASE}
MONGODB_URI=mongodb://mongo:27017/vireon_ci
MINIO_ROOT_USER=ci-user
MINIO_ROOT_PASSWORD=ci-password-1234
ENVEOF

compose() { docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f docker-compose.yml -f deploy/ci/compose.ci.yml "$@"; }

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "::group::smoke test FAILED - container state and logs"
    compose ps -a || true
    compose logs --no-color --tail 80 backend frontend redis mongo || true
    echo "::endgroup::"
  fi
  compose down -v --remove-orphans --timeout 10 || true
  rm -f "$ENV_FILE"
  exit "$status"
}
trap cleanup EXIT

echo "==> starting redis, mongo, backend, frontend (project $PROJECT)"
compose up -d --no-build --pull never --wait --wait-timeout 240 redis mongo backend frontend
compose ps

fetch() { curl --silent --show-error --fail --max-time 5 --retry 10 --retry-connrefused --retry-delay 2 "$@"; }

echo "==> backend /health through nginx"
fetch "$BASE/health" | grep -q '"status":"ok"'

echo "==> backend /api/version"
VERSION_JSON="$(fetch "$BASE/api/version")"
echo "$VERSION_JSON"
if [ -n "${SMOKE_COMMIT:-}" ]; then
  echo "$VERSION_JSON" | grep -q "\"commit\":\"${SMOKE_COMMIT:0:7}\""
fi

echo "==> frontend serves the app shell"
fetch "$BASE/" | grep -q '<div id="root"'

echo "==> frontend build stamp /version.json"
STAMP="$(fetch "$BASE/version.json")"
echo "$STAMP"
if [ -n "${SMOKE_COMMIT:-}" ]; then
  echo "$STAMP" | grep -q "\"commit\":\"${SMOKE_COMMIT}\""
fi

echo "==> all containers still running after the checks"
if compose ps --format '{{.Service}} {{.State}}' | grep -v ' running$'; then
  echo "a container is not running" >&2
  exit 1
fi

echo "smoke test passed"

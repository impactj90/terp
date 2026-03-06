#!/usr/bin/env bash
set -euo pipefail

SERVER="${1:?Usage: deploy.sh <server-ip>}"
REMOTE="root@${SERVER}"
APP_DIR="/opt/terp"

echo "=== Building API Docker image ==="
docker build -f docker/api.Dockerfile -t terp-api:latest .

echo "=== Saving image ==="
docker save terp-api:latest | gzip > /tmp/terp-api.tar.gz

echo "=== Uploading to server ==="
ssh "${REMOTE}" "mkdir -p ${APP_DIR}/migrations"
scp /tmp/terp-api.tar.gz "${REMOTE}:${APP_DIR}/terp-api.tar.gz"
scp docker/docker-compose.prod.yml "${REMOTE}:${APP_DIR}/docker-compose.prod.yml"
scp docker/Caddyfile.prod "${REMOTE}:${APP_DIR}/Caddyfile.prod"
scp db/migrations/* "${REMOTE}:${APP_DIR}/migrations/"

echo "=== Loading image on server ==="
ssh "${REMOTE}" "docker load < ${APP_DIR}/terp-api.tar.gz"

echo "=== Starting services ==="
ssh "${REMOTE}" "cd ${APP_DIR} && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d"

echo "=== Running migrations ==="
# Source .env.prod to get DATABASE_URL, then run migrate via Docker
ssh "${REMOTE}" "cd ${APP_DIR} && source .env.prod && docker run --rm \
    -v ${APP_DIR}/migrations:/migrations \
    migrate/migrate:v4.17.1 \
    -path=/migrations \
    -database \"\${DATABASE_URL}\" \
    up"

echo "=== Cleaning up local temp file ==="
rm -f /tmp/terp-api.tar.gz

echo ""
echo "========================================="
echo "  Deployment complete!"
echo "  API: http://${SERVER}"
echo "========================================="

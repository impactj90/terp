#!/bin/sh
set -e

if [ -z "$DEMO_PASSWORD" ]; then
  echo "ERROR: DEMO_PASSWORD is not set"
  exit 1
fi

# Generate bcrypt hash from plaintext password
export DEMO_PASSWORD_HASH=$(caddy hash-password --plaintext "$DEMO_PASSWORD")

# Start Caddy
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile

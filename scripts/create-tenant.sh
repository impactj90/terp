#!/usr/bin/env bash
set -euo pipefail

# Create a new tenant with an admin user.
# Requires: psql, htpasswd (apache2-utils)
#
# Usage:
#   ./scripts/create-tenant.sh
#   DATABASE_URL="postgres://user:pass@host:5432/terp" ./scripts/create-tenant.sh

DATABASE_URL="${DATABASE_URL:-postgres://dev:dev@localhost:5432/terp?sslmode=disable}"

# --- Check dependencies ---
for cmd in psql htpasswd; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' not found."
    [[ "$cmd" == "htpasswd" ]] && echo "  Install: sudo pacman -S apache  (or apt install apache2-utils)"
    exit 1
  fi
done

# --- Collect input ---
read -rp "Tenant Name (z.B. 'Mustermann GmbH'): " TENANT_NAME
read -rp "Tenant Slug (z.B. 'mustermann'): " TENANT_SLUG
read -rp "Admin Email: " ADMIN_EMAIL
read -rp "Admin Anzeigename: " ADMIN_DISPLAY_NAME
read -srp "Admin Passwort: " ADMIN_PASSWORD
echo

if [[ -z "$TENANT_NAME" || -z "$TENANT_SLUG" || -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" || -z "$ADMIN_DISPLAY_NAME" ]]; then
  echo "Error: Alle Felder sind Pflichtfelder."
  exit 1
fi

# --- Generate bcrypt hash ---
# htpasswd uses $2y$, Go's bcrypt expects $2a$ (functionally identical)
PASSWORD_HASH=$(htpasswd -nbBC 10 "" "$ADMIN_PASSWORD" | cut -d: -f2 | sed 's/\$2y\$/\$2a\$/')

# --- Insert into DB (single transaction, parameterized) ---
TENANT_ID=$(psql "$DATABASE_URL" -Atq -v ON_ERROR_STOP=1 \
  -v tenant_name="$TENANT_NAME" \
  -v tenant_slug="$TENANT_SLUG" \
  -v admin_email="$ADMIN_EMAIL" \
  -v admin_display_name="$ADMIN_DISPLAY_NAME" \
  -v password_hash="$PASSWORD_HASH" \
  <<'SQL'
BEGIN;

WITH new_tenant AS (
  INSERT INTO tenants (name, slug, is_active, vacation_basis)
  VALUES (:'tenant_name', :'tenant_slug', true, 'calendar_year')
  RETURNING id
),
new_user AS (
  INSERT INTO users (tenant_id, email, display_name, password_hash, role, is_active, is_locked)
  SELECT id, :'admin_email', :'admin_display_name', :'password_hash', 'admin', true, false
  FROM new_tenant
  RETURNING id, tenant_id
)
INSERT INTO user_tenants (user_id, tenant_id, role)
SELECT id, tenant_id, 'member' FROM new_user
RETURNING tenant_id;

COMMIT;
SQL
)

echo ""
echo "=== Tenant erstellt ==="
echo "  Tenant ID:   $TENANT_ID"
echo "  Tenant Name: $TENANT_NAME"
echo "  Tenant Slug: $TENANT_SLUG"
echo "  Admin Email: $ADMIN_EMAIL"
echo ""
echo "Der Admin kann sich jetzt einloggen."

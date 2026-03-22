#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

VAULT_FILES=(.env.production.vault .env.staging.vault .env.local.vault)

missing=()
for f in "${VAULT_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    missing+=("$f")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing vault files: ${missing[*]}"
  exit 1
fi

for f in "${VAULT_FILES[@]}"; do
  out="${f%.vault}"
  ansible-vault decrypt --output "$out" "$f"
  echo "Decrypted $f -> $out"
done

echo "All env files decrypted."

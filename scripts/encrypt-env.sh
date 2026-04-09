#!/usr/bin/env bash
#
# Re-encrypt plaintext env files into ansible-vault containers for check-in.
#
# Symmetric counterpart to scripts/decrypt-env.sh. For each of the three
# env files (.env.production, .env.staging, .env.local) that exists as
# plaintext in the project root, runs `ansible-vault encrypt` and writes
# the output to the matching .vault file, overwriting it.
#
# Usage:
#   scripts/encrypt-env.sh            # encrypt every plaintext file that exists
#   scripts/encrypt-env.sh .env.local # encrypt only the files you pass
#
# Missing plaintext files are reported and skipped, not fatal — a dev who
# only touched .env.local shouldn't need .env.production on disk.
#
# The vault password is prompted interactively by ansible-vault. Use a
# ~/.vault_pass file and ANSIBLE_VAULT_PASSWORD_FILE=~/.vault_pass to skip
# the prompt on trusted machines.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v ansible-vault >/dev/null 2>&1; then
  echo "ansible-vault not found. Install via: pipx install ansible-core" >&2
  exit 1
fi

# Default set if no args passed.
if [ "$#" -eq 0 ]; then
  FILES=(.env.production .env.staging .env.local)
else
  FILES=("$@")
fi

encrypted=0
skipped=0

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "Skipping $f (plaintext not found)"
    skipped=$((skipped + 1))
    continue
  fi
  out="$f.vault"
  ansible-vault encrypt --output "$out" "$f"
  echo "Encrypted $f -> $out"
  encrypted=$((encrypted + 1))
done

if [ "$encrypted" -eq 0 ]; then
  echo "No files encrypted." >&2
  exit 1
fi

echo "Done — encrypted $encrypted file(s), skipped $skipped."
echo "Remember to commit the updated .vault files."

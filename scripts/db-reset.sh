#!/usr/bin/env bash

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
STORAGE_BUCKETS_URL="${SUPABASE_URL%/}/storage/v1/bucket"
RECOVERY_TIMEOUT_SECONDS="${RECOVERY_TIMEOUT_SECONDS:-90}"
RECOVERY_POLL_INTERVAL_SECONDS="${RECOVERY_POLL_INTERVAL_SECONDS:-2}"
FIRST_ATTEMPT_LOG=""
SECOND_ATTEMPT_LOG=""

cleanup() {
  rm -f "${FIRST_ATTEMPT_LOG:-}" "${SECOND_ATTEMPT_LOG:-}"
}

trap cleanup EXIT

run_reset() {
  local log_file="$1"

  set +e
  npx supabase db reset 2>&1 | tee "$log_file"
  local reset_status=${PIPESTATUS[0]}
  set -e

  return "$reset_status"
}

storage_proxy_ready() {
  local http_code

  http_code="$(
    curl -sS -o /dev/null -w '%{http_code}' "$STORAGE_BUCKETS_URL" || true
  )"

  [[ "$http_code" != "000" && "$http_code" != "502" ]]
}

wait_for_storage_proxy() {
  local deadline
  deadline=$((SECONDS + RECOVERY_TIMEOUT_SECONDS))

  while (( SECONDS < deadline )); do
    if storage_proxy_ready; then
      return 0
    fi

    sleep "$RECOVERY_POLL_INTERVAL_SECONDS"
  done

  return 1
}

main() {
  FIRST_ATTEMPT_LOG="$(mktemp)"
  SECOND_ATTEMPT_LOG="$(mktemp)"

  if run_reset "$FIRST_ATTEMPT_LOG"; then
    return 0
  fi

  if ! grep -q "Error status 502: An invalid response was received from the upstream server" "$FIRST_ATTEMPT_LOG"; then
    return 1
  fi

  echo
  echo "Supabase Storage returned 502 after restart. Waiting for the proxy route to recover before retrying once..."

  if ! wait_for_storage_proxy; then
    echo "Storage proxy did not recover within ${RECOVERY_TIMEOUT_SECONDS}s." >&2
    return 1
  fi

  echo "Storage proxy recovered. Retrying 'supabase db reset' once..."
  run_reset "$SECOND_ATTEMPT_LOG"
}

main "$@"

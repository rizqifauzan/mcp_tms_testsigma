#!/usr/bin/env bash
# Measure Testsigma TMS rate-limit window empirically.
# Closes REFERENCE.md §8 open item #5: "10 requests per WHAT".
#
# Strategy:
#   1. Burst 12 requests as fast as possible against a cheap GET (/projects)
#   2. Record HTTP status + remaining/reset headers per request
#   3. If we see 429 → that's the per-second limit
#   4. If all 12 succeed → wait 1s, burst again. If still passes, the window
#      is per-minute or longer
#
# Usage:
#   export TMS_API_KEY='your-key'
#   ./scripts/burst_test.sh

set -uo pipefail

BASE="${TMS_BASE:-https://test-management.testsigma.com/api/v1}"
KEY="${TMS_API_KEY:-}"

if [[ -z "$KEY" ]]; then
  echo "ERROR: set TMS_API_KEY env var" >&2
  exit 1
fi

fire() {
  local i="$1"
  local started
  started="$(date +%s.%N)"
  local out
  out=$(curl -sS -o /dev/null -w '%{http_code}\t%header{x-tms-api-remaining}\t%header{x-tms-api-reset}\n' \
    -H "Authorization: Bearer $KEY" \
    "$BASE/projects?page_size=1")
  printf '[%2d] %s  t=+%.3fs\n' "$i" "$out" "$(echo "$(date +%s.%N) - $started" | bc)"
}

echo "=== Round 1: 12 requests as fast as possible ==="
for i in $(seq 1 12); do
  fire "$i" &
done
wait

echo ""
echo "=== Round 2: same 12 requests, 1s delay between each ==="
for i in $(seq 1 12); do
  fire "$i"
  sleep 1
done

echo ""
echo "Done. Look for the first 429 in round 1 (per-second cap) or round 2 (per-minute)."

#!/usr/bin/env bash
# Phase 0 — authenticated discovery probe for Testsigma TMS REST API.
#
# Usage:
#   export TMS_API_KEY='your-key-here'
#   ./scripts/probe.sh
#
# Output: tmp/phase0/<endpoint>.{headers,body}
# Does NOT commit the key or the output. Add tmp/ to .gitignore before running.

set -uo pipefail

BASE="${TMS_BASE:-https://test-management.testsigma.com/api/v1}"
KEY="${TMS_API_KEY:-}"
OUT="tmp/phase0"

if [[ -z "$KEY" ]]; then
  echo "ERROR: set TMS_API_KEY env var before running." >&2
  exit 1
fi

mkdir -p "$OUT"

probe() {
  local method="$1"
  local path="$2"
  local label="$3"
  local extra=("${@:4}")

  local file_base="$OUT/${label}"
  local code
  code=$(curl -sS -o "${file_base}.body" -D "${file_base}.headers" \
    -w "%{http_code}" \
    -X "$method" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Accept: application/json" \
    "${extra[@]}" \
    "${BASE}${path}" || echo "000")

  local ct
  ct=$(grep -i '^content-type:' "${file_base}.headers" | head -1 | tr -d '\r' | awk '{print $2}')
  local size
  size=$(wc -c < "${file_base}.body" | tr -d ' ')

  printf "%-5s %-45s %3s  %-25s  %s bytes\n" "$method" "$path" "$code" "${ct:-?}" "$size"
}

echo "== Authentication sanity check =="
probe GET /projects projects

echo ""
echo "== Swagger / OpenAPI (jackpot if 200) =="
probe GET /swagger.json swagger_v1
probe GET /swagger swagger
probe GET /docs docs
probe GET /openapi.json openapi

echo ""
echo "== Identity =="
probe GET /me me
probe GET /users/me users_me
probe GET /account account
probe GET /workspaces workspaces
probe GET /organizations organizations

echo ""
echo "== Core resources (path style: snake_case) =="
probe GET /projects projects_list
probe GET /folders folders_list
probe GET /test_cases test_cases_list
probe GET /test_suites test_suites_list
probe GET /test_plans test_plans_list
probe GET /test_runs test_runs_list
probe GET /requirements requirements_list
probe GET /labels labels_list
probe GET /custom_fields custom_fields_list

echo ""
echo "== Core resources (path style: camelCase) =="
probe GET /testCases testcases_camel
probe GET /testSuites testsuites_camel
probe GET /testPlans testplans_camel
probe GET /testRuns testruns_camel
probe GET /customFields customfields_camel

echo ""
echo "== Pagination probes (against whichever path returned 200) =="
probe GET '/projects?page=1&per_page=5' projects_pageperpage
probe GET '/projects?page=1&pageSize=5' projects_pagepagesize
probe GET '/projects?limit=5&offset=0' projects_limitoffset
probe GET '/projects?cursor=' projects_cursor

echo ""
echo "== GraphQL hint =="
probe POST /graphql graphql_introspect \
  -H "Content-Type: application/json" \
  --data '{"query":"{__schema{queryType{name}}}"}'

echo ""
echo "== Inspect rate-limit / pagination headers on the working endpoint =="
echo "--- /projects response headers ---"
cat "$OUT/projects.headers" 2>/dev/null || echo "(no headers captured)"

echo ""
echo "== Done. Outputs in: $OUT =="
echo "Next: open the .body files (jq pipe is helpful) and fill REFERENCE.md §5"
echo "  jq . $OUT/projects.body | head -60"

#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPTS="$ROOT/deployment/st-ci/scripts"

failures=0
run() {
  log_msg="$1"
  shift
  if "$@"; then
    printf 'OK %s\n' "$log_msg"
  else
    printf 'FAIL %s\n' "$log_msg"
    failures=$((failures + 1))
  fi
}

run "discover.sh --self-test" bash "$SCRIPTS/discover.sh" --self-test
run "isolation-guard --self-test" bash "$SCRIPTS/isolation-guard.sh" --self-test

switch_gate_test() {
  local tmp out
  tmp="$(mktemp -d)"
  export ST_DEPLOY_STATE_DIR="$tmp/state" ST_DEPLOY_LOCK_FILE="$tmp/lock"
  export ST_CANDIDATE_PROFILE="$ROOT/deployment/st-ci/fixtures/isolation-guard.profile"
  export ST_TRAFFIC_SWITCH_ENABLED=1 ST_ISOLATION_PROFILE_VALIDATED=1
  export ST_CANDIDATE_COMPOSE_PROJECT="donehai-candidate-deadbeef-1"
  local sha_a sha_b lc="$SCRIPTS/candidate-lifecycle.sh"
  sha_a="$(printf 'a%.0s' $(seq 40))"
  sha_b="$(printf 'b%.0s' $(seq 40))"

  out="$(bash "$lc" switch-traffic 2>&1)" && { echo "switch ran without manifest"; return 1; }
  grep -q 'no manifest' <<<"$out" || { echo "$out"; return 1; }

  bash "$lc" record-manifest "$tmp/state/$ST_CANDIDATE_COMPOSE_PROJECT.json" repo "$sha_a" "$sha_b" \
    "$ST_CANDIDATE_COMPOSE_PROJECT" >/dev/null || return 1
  out="$(bash "$lc" switch-traffic 2>&1)" && { echo "switch ran with db_init unknown"; return 1; }
  grep -q 'db_init_status=unknown' <<<"$out" || { echo "$out"; return 1; }

  bash "$lc" record-result "$ST_CANDIDATE_COMPOSE_PROJECT" failed >/dev/null || return 1
  grep -q '"app_commit_sha": "'"$sha_a"'"' "$tmp/state/$ST_CANDIDATE_COMPOSE_PROJECT.json" || return 1
  grep -q '"automation_commit_sha": "'"$sha_b"'"' "$tmp/state/$ST_CANDIDATE_COMPOSE_PROJECT.json" || return 1
  grep -q '"playwright_result": "failed"' "$tmp/state/$ST_CANDIDATE_COMPOSE_PROJECT.json" || return 1
  rm -rf "$tmp"
}
run "switch-traffic refuses without a passing manifest; manifest records both SHAs" \
  bash -c "$(declare -f switch_gate_test); ROOT='$ROOT' SCRIPTS='$SCRIPTS' switch_gate_test"

for f in "$SCRIPTS"/lib/*.sh "$SCRIPTS"/*.sh; do
  run "bash -n $(basename "$f")" bash -n "$f"
done

if [ -f "$ROOT/.github/workflows/st-candidate-deploy.yml" ]; then
  if command -v actionlint >/dev/null 2>&1; then
    run "actionlint st-candidate-deploy.yml" actionlint "$ROOT/.github/workflows/st-candidate-deploy.yml"
  else
    printf 'SKIP actionlint (not installed)\n'
  fi
fi

printf 'self-test finished: %s failure(s)\n' "$failures"
[ "$failures" -eq 0 ]

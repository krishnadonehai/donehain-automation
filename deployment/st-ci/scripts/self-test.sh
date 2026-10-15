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

guard_profile_with() {
  # guard_profile_with <dir> <extra profile lines...>: fixture profile plus overrides.
  local dir="$1"
  shift
  { cat "$ROOT/deployment/st-ci/fixtures/isolation-guard.profile"; printf '%s\n' "$@"; } >"$dir/p.profile"
  printf '%s' "$dir/p.profile"
}

manual_migration_policy_test() {
  local tmp out
  tmp="$(mktemp -d)"
  out="$(ST_CANDIDATE_PROFILE="$(guard_profile_with "$tmp" 'ST_CANDIDATE_MIGRATIONS_ALLOWED="1"')" \
    bash "$SCRIPTS/isolation-guard.sh" 2>&1)" && { echo "guard accepted MIGRATIONS_ALLOWED=1"; return 1; }
  grep -q 'manual prerequisite' <<<"$out" || { echo "$out"; return 1; }
  out="$(ST_CANDIDATE_PROFILE="$(guard_profile_with "$tmp" 'ST_CANDIDATE_DB_SEED_ONLY="1"')" \
    bash "$SCRIPTS/isolation-guard.sh" 2>&1)" && { echo "guard accepted DB_SEED_ONLY=1"; return 1; }
  # The pipeline itself never applies SQL files, migration runners or seed directories.
  local lc="$SCRIPTS/candidate-lifecycle.sh"
  local forbidden='run_migrations|run-all-migrations|Local\.sql|SEED_DIR|CANDIDATE_DB_INIT_STRICT|CANDIDATE_DB_LOAD_GEO_SEED|ALLOW_DB_INIT_ERRORS|psql[^|]*-f '
  if grep -v '^[[:space:]]*#' "$lc" | grep -Eq "$forbidden"; then
    echo "candidate-lifecycle.sh references a migration/seed mechanism:"
    grep -v '^[[:space:]]*#' "$lc" | grep -En "$forbidden"
    return 1
  fi
  # The only psql invocation is the read-only schema gate.
  [ "$(grep -c 'psql ' "$lc")" = 1 ] && grep -q "default_transaction_read_only=on" "$lc" \
    || { echo "unexpected psql usage in candidate-lifecycle.sh"; return 1; }
  rm -rf "$tmp"
}
run "manual-migration policy: guard rejects migration/seed flags; lifecycle runs no SQL besides the read-only gate" \
  bash -c "$(declare -f guard_profile_with manual_migration_policy_test); ROOT='$ROOT' SCRIPTS='$SCRIPTS' manual_migration_policy_test"

baseline_volume_guard_test() {
  local tmp out
  tmp="$(mktemp -d)"
  out="$(ST_CANDIDATE_PROFILE="$(guard_profile_with "$tmp" 'ST_CANDIDATE_DB_BASELINE_VOLUME="deployment_db-data"')" \
    bash "$SCRIPTS/isolation-guard.sh" 2>&1)" && { echo "guard accepted a live volume as baseline"; return 1; }
  grep -q 'live compose project' <<<"$out" || { echo "$out"; return 1; }
  out="$(ST_CANDIDATE_PROFILE="$(guard_profile_with "$tmp" 'ST_LIVE_PROTECTED_VOLUMES="deployment_db-data,st_pgdata"' 'ST_CANDIDATE_DB_BASELINE_VOLUME="st_pgdata"')" \
    bash "$SCRIPTS/isolation-guard.sh" 2>&1)" && { echo "guard accepted a protected volume as baseline"; return 1; }
  grep -q 'protected live volume' <<<"$out" || { echo "$out"; return 1; }
  rm -rf "$tmp"
}
run "isolation guard rejects live/protected volumes as the candidate DB baseline" \
  bash -c "$(declare -f guard_profile_with baseline_volume_guard_test); ROOT='$ROOT' SCRIPTS='$SCRIPTS' baseline_volume_guard_test"

state_dir_test() {
  local tmp out lc="$SCRIPTS/candidate-lifecycle.sh" sha
  tmp="$(mktemp -d)"
  sha="$(printf 'a%.0s' $(seq 40))"
  export ST_CANDIDATE_PROFILE="$ROOT/deployment/st-ci/fixtures/isolation-guard.profile"
  grep -q '/var/lib/donehai-st' "$lc" && { echo "lifecycle still defaults to /var/lib/donehai-st"; return 1; }
  # Default: runner-owned XDG state dir.
  out="$(unset ST_DEPLOY_STATE_DIR; XDG_STATE_HOME="$tmp/xdg" bash -c "source '$lc'; load_profile; printf '%s' \"\$STATE_DIR\"")" || return 1
  [ "$out" = "$tmp/xdg/donehai-st/deployments" ] && [ -d "$out" ] || { echo "default state dir: $out"; return 1; }
  # Unwritable state dir fails with an actionable message (a regular file blocks mkdir, even as root).
  : >"$tmp/blocker"
  out="$(ST_DEPLOY_STATE_DIR="$tmp/blocker/state" ST_CANDIDATE_COMPOSE_PROJECT=donehai-candidate-x bash "$lc" record-result donehai-candidate-x passed 2>&1)" \
    && { echo "record-result succeeded with unwritable state dir"; return 1; }
  grep -q 'ST_DEPLOY_STATE_DIR' <<<"$out" || { echo "$out"; return 1; }
  out="$(ST_DEPLOY_STATE_DIR="relative/dir" bash "$lc" health-candidate 2>&1)" && { echo "relative state dir accepted"; return 1; }
  grep -q 'absolute path' <<<"$out" || { echo "$out"; return 1; }
  rm -rf "$tmp"
}
run "state dir defaults to a runner-writable path and unwritable dirs fail clearly" \
  bash -c "$(declare -f state_dir_test); ROOT='$ROOT' SCRIPTS='$SCRIPTS' state_dir_test"

manifest_failure_test() {
  local tmp out sha
  tmp="$(mktemp -d)"
  sha="$(printf 'c%.0s' $(seq 40))"
  : >"$tmp/blocker"
  out="$(bash "$SCRIPTS/candidate-lifecycle.sh" record-manifest "$tmp/blocker/m.json" repo "$sha" "$sha" donehai-candidate-x 2>&1)" \
    && { echo "record-manifest reported success for an unwritable path"; return 1; }
  grep -q 'wrote deployment manifest' <<<"$out" && { echo "printed success after failed write: $out"; return 1; }
  # Successful write leaves no temp files and restrictive permissions.
  bash "$SCRIPTS/candidate-lifecycle.sh" record-manifest "$tmp/ok/m.json" repo "$sha" "$sha" donehai-candidate-x >/dev/null || return 1
  [ -s "$tmp/ok/m.json" ] && [ -s "$tmp/ok/m.env" ] || { echo "manifest files missing"; return 1; }
  ls -A "$tmp/ok" | grep -q '^\.manifest' && { echo "temp files left behind"; return 1; }
  rm -rf "$tmp"
}
run "manifest write failure is reported (no success message, non-zero exit)" \
  bash -c "$(declare -f manifest_failure_test); ROOT='$ROOT' SCRIPTS='$SCRIPTS' manifest_failure_test"

schema_gate_test() {
  local tmp repo base app changed v
  tmp="$(mktemp -d)"
  repo="$tmp/app"
  git init -q "$repo" && git -C "$repo" config user.email t@t && git -C "$repo" config user.name t
  mkdir -p "$repo/deployment/st-ci" "$repo/server/sql"
  printf 'server/sql\n' >"$repo/deployment/st-ci/candidate-schema-paths.txt"
  printf 'select 1;\n' >"$repo/server/sql/a.sql"
  git -C "$repo" add -A && git -C "$repo" commit -qm base
  base="$(git -C "$repo" rev-parse HEAD)"
  printf 'x\n' >"$repo/README" && git -C "$repo" add -A && git -C "$repo" commit -qm docs
  app="$(git -C "$repo" rev-parse HEAD)"
  printf 'select 2;\n' >"$repo/server/sql/b.sql" && git -C "$repo" add -A && git -C "$repo" commit -qm schema
  changed="$(git -C "$repo" rev-parse HEAD)"

  # shellcheck disable=SC1090
  source "$SCRIPTS/candidate-lifecycle.sh"
  for v in not_candidate not_migrated missing_relations missing_fixtures; do
    [ "$(schema_gate_verdict "CANDIDATE_SCHEMA_GATE status=$v" "$repo" "$app")" = "$v" ] || { echo "status $v not propagated"; return 1; }
    schema_gate_verdict "CANDIDATE_SCHEMA_GATE status=$v" "$repo" "$app" >/dev/null && { echo "status $v returned success"; return 1; }
  done
  [ "$(schema_gate_verdict "" "$repo" "$app")" = gate_error ] || { echo "empty gate line not an error"; return 1; }
  [ "$(schema_gate_verdict "CANDIDATE_SCHEMA_GATE status=ok fixtures=x" "$repo" "$app")" = gate_error ] || { echo "ok without sha accepted"; return 1; }
  [ "$(schema_gate_verdict "CANDIDATE_SCHEMA_GATE status=ok migrated_from_sha=$base fixtures=fixed-otp-v1" "$repo" "$app")" = ok ] \
    || { echo "fresh baseline rejected"; return 1; }
  [ "$(schema_gate_verdict "CANDIDATE_SCHEMA_GATE status=ok migrated_from_sha=$base fixtures=fixed-otp-v1" "$repo" "$changed" 2>/dev/null)" = stale ] \
    || { echo "baseline with changed schema paths not stale"; return 1; }
  [ "$(schema_gate_verdict "CANDIDATE_SCHEMA_GATE status=ok migrated_from_sha=$changed fixtures=fixed-otp-v1" "$repo" "$app" 2>/dev/null)" = stale ] \
    || { echo "non-ancestor baseline not stale"; return 1; }
  rm -rf "$tmp"
}
run "schema gate: only a recorded, fresh manual migration passes; every other state fails early" \
  bash -c "$(declare -f schema_gate_test); ROOT='$ROOT' SCRIPTS='$SCRIPTS' schema_gate_test"

live_dependency_test() {
  # shellcheck disable=SC1090
  source "$SCRIPTS/candidate-lifecycle.sh"
  local ok bad
  ok='{"services":{"server":{"environment":{"DB_HOST":"database","REDIS_URL":"redis://redis:6379","KAFKA_BROKERS":""}},"notification-service":{"environment":{"PGHOST":"database","REDIS_URL":""}}},"networks":{"donehai-network":{"name":"p_donehai-network"}},"volumes":{"db-data":{"name":"p_db-data"}}}'
  [ -z "$(printf '%s' "$ok" | candidate_dependency_violations)" ] || { echo "isolated config flagged"; return 1; }
  bad='{"services":{"server":{"environment":{"DB_HOST":"10.0.0.5","REDIS_URL":"redis://st-redis:6379","KAFKA_BROKERS":"broker.st:9092","DATABASE_URL":"postgres://x"}}},"networks":{"n":{"external":true}},"volumes":{"v":{"external":true}}}'
  local out
  out="$(printf '%s' "$bad" | candidate_dependency_violations)"
  for want in 'DB_HOST=10.0.0.5' 'REDIS_URL=redis://st-redis' 'KAFKA_BROKERS includes broker.st' 'DATABASE_URL' 'network n is external' 'volume v is external'; do
    grep -qF "$want" <<<"$out" || { echo "missing violation: $want"; echo "$out"; return 1; }
  done
}
run "live dependencies in the resolved candidate config fail closed" \
  bash -c "$(declare -f live_dependency_test); ROOT='$ROOT' SCRIPTS='$SCRIPTS' live_dependency_test"

cleanup_scope_test() {
  # shellcheck disable=SC1090
  source "$SCRIPTS/candidate-lifecycle.sh"
  ST_LIVE_PROTECTED_VOLUMES="deployment_db-data,deployment_redis-data"
  ST_CANDIDATE_DB_BASELINE_VOLUME="donehai-candidate-db-baseline"
  is_protected_volume deployment_redis-data || { echo "second protected volume not recognised"; return 1; }
  is_protected_volume donehai-candidate-db-baseline || { echo "baseline not protected"; return 1; }
  is_protected_volume donehai-candidate-abc-1_db-data && { echo "candidate volume treated as protected"; return 1; }
  return 0
}
run "cleanup never removes live volumes or the candidate baseline" \
  bash -c "$(declare -f cleanup_scope_test); ROOT='$ROOT' SCRIPTS='$SCRIPTS' cleanup_scope_test"

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

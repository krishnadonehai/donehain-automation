#!/usr/bin/env bash
# ST candidate build/start/test-prep/cleanup/traffic control (ST VPS only).
# Traffic switch is disabled unless ST_TRAFFIC_SWITCH_ENABLED=1, ST_ISOLATION_PROFILE_VALIDATED=1
# and the candidate's manifest records db_init_status=ok and playwright_result=passed.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/log.sh
source "$SCRIPT_DIR/lib/log.sh"
# shellcheck source=lib/sha-record.sh
source "$SCRIPT_DIR/lib/sha-record.sh"

LOCK_FILE="${ST_DEPLOY_LOCK_FILE:-/var/lock/donehai-st-deploy.lock}"
# Resolved after the profile is loaded (resolve_state_dir); must be writable by the runner user.
STATE_DIR=""

usage() {
  cat <<'EOF'
Usage: candidate-lifecycle.sh <command> [args]

Commands:
  deploy <app_full_sha> <automation_full_sha> <app_repo>   Build/start isolated candidate from the exact app SHA
  health-candidate                                         HTTP health against candidate ports
  verify-otp-account <identifier>                          Candidate knows the fixed-OTP account (no OTP is delivered)
  record-result <candidate_id> <passed|failed>             Record the Playwright result in the candidate manifest
  health-public                                            HTTP health against public ST URLs
  cleanup-candidate                                        Remove candidate resources only
  switch-traffic                                           Point ST proxy at candidate (gated)
  rollback-traffic                                         Restore previous ST upstream
  record-manifest <path> <app_repo> <app_sha> <auto_sha> <candidate_id> [switch_flag]

Environment:
  ST_CANDIDATE_PROFILE           Path to candidate.profile (required)
  ST_DEPLOY_STATE_DIR            Manifest directory, runner-writable (env or profile; default
                                 ${XDG_STATE_HOME:-$HOME/.local/state}/donehai-st/deployments)
  ST_CANDIDATE_RUN_ID            Unique run suffix for the compose project (CI: run_id-attempt)
  ST_CANDIDATE_COMPOSE_PROJECT   Candidate id for cleanup-candidate / switch-traffic
  ST_TRAFFIC_SWITCH_ENABLED      Must be 1 to run switch-traffic
  ST_ISOLATION_PROFILE_VALIDATED Must be 1 to run switch-traffic
EOF
}

acquire_lock() {
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    fail "another ST deployment is in progress (lock: $LOCK_FILE)"
  fi
  log "acquired deployment lock"
}

fail() {
  log_err "$*"
  exit 1
}

load_profile() {
  local profile="${ST_CANDIDATE_PROFILE:-}"
  [ -n "$profile" ] && [ -r "$profile" ] || fail "ST_CANDIDATE_PROFILE must be readable"
  # shellcheck disable=SC1090
  source "$profile"
  resolve_state_dir
}

# Persistent across the deploy / playwright / promote jobs on the same runner, owned by the
# runner user (no root-owned /var/lib path, no world-writable permissions).
resolve_state_dir() {
  STATE_DIR="${ST_DEPLOY_STATE_DIR:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/donehai-st/deployments}"
  case "$STATE_DIR" in
    /*) ;;
    *) fail "ST_DEPLOY_STATE_DIR must be an absolute path (got '$STATE_DIR')" ;;
  esac
  if ! (umask 077 && mkdir -p "$STATE_DIR") 2>/dev/null || [ ! -w "$STATE_DIR" ]; then
    fail "state dir $STATE_DIR is not writable by $(id -un 2>/dev/null || echo '?'); set ST_DEPLOY_STATE_DIR in the profile to a runner-owned directory"
  fi
}

manifest_path() {
  printf '%s/%s.json' "$STATE_DIR" "$1"
}

checkout_app_exact_sha() {
  local sha="$1"
  validate_full_sha "$sha" "app commit" || exit 1
  : "${ST_APP_REPO_DIR:?ST_APP_REPO_DIR required in profile}"

  git -C "$ST_APP_REPO_DIR" rev-parse --git-dir >/dev/null 2>&1 || fail "not a git repo: $ST_APP_REPO_DIR"

  log "fetching app repository (no checkout of floating branch)"
  git -C "$ST_APP_REPO_DIR" fetch --quiet origin "$sha" || fail "cannot fetch app commit $sha"

  local worktree="$ST_APP_REPO_DIR/.ci-worktrees/$sha"
  mkdir -p "$(dirname "$worktree")"
  if [ -d "$worktree" ]; then
    git -C "$ST_APP_REPO_DIR" worktree remove --force "$worktree" 2>/dev/null || rm -rf "$worktree"
  fi
  git -C "$ST_APP_REPO_DIR" worktree add --detach "$worktree" "$sha" || fail "worktree add failed for $sha"

  local checked
  checked=$(git -C "$worktree" rev-parse HEAD)
  if [ "$checked" != "$sha" ]; then
    fail "refusing to build: worktree HEAD $checked != requested $sha"
  fi
  log "app worktree pinned at $checked"
  export ST_APP_WORKTREE="$worktree"
}

# docker compose against the standalone candidate file only (never the live ST compose file).
candidate_compose() {
  local project="$1"
  shift
  local args=(-p "$project" -f "$ST_APP_WORKTREE/$ST_APP_CANDIDATE_COMPOSE_FILE")
  if [ -n "${ST_APP_CANDIDATE_ENV_FILE:-}" ]; then
    args+=(--env-file "$ST_APP_CANDIDATE_ENV_FILE")
  fi
  docker compose "${args[@]}" "$@"
}

export_candidate_env() {
  local project="$1"
  # Runner env must never leak shared ST endpoints into compose interpolation.
  unset REDIS_URL KAFKA_BROKERS DATABASE_URL COMPOSE_FILE COMPOSE_PROJECT_NAME

  export CANDIDATE_INSTANCE_ID="$project"
  export CANDIDATE_WEB_PORT="$ST_CANDIDATE_WEB_PORT"
  export CANDIDATE_GATEWAY_PORT="$ST_CANDIDATE_API_PORT"
  export CANDIDATE_SERVER_PORT="$ST_CANDIDATE_SERVER_PORT"
  export CANDIDATE_NOTIFICATION_PORT="${ST_CANDIDATE_NOTIFICATION_PORT:-13012}"
  export CANDIDATE_KNOWLEDGE_PORT="${ST_CANDIDATE_KNOWLEDGE_PORT:-13003}"
  export CANDIDATE_FRONTEND_URL="${ST_CANDIDATE_FRONTEND_URL:-http://127.0.0.1:$ST_CANDIDATE_WEB_PORT}"
  export CANDIDATE_VITE_API_BASE_URL="${ST_CANDIDATE_VITE_API_BASE_URL:-http://127.0.0.1:$ST_CANDIDATE_API_PORT/api}"
}

# Reads `docker compose config --format json` on stdin and prints one line per live-dependency
# violation: external networks/volumes, or DB/Redis/Kafka endpoints outside the candidate project.
candidate_dependency_violations() {
  python3 -c '
import json, re, sys
d = json.load(sys.stdin)
out = []
for k, v in (d.get("networks") or {}).items():
    if (v or {}).get("external"):
        out.append("network %s is external" % k)
for k, v in (d.get("volumes") or {}).items():
    if (v or {}).get("external"):
        out.append("volume %s is external" % k)
local_host = {"DB_HOST": "database", "PGHOST": "database"}
for name, svc in (d.get("services") or {}).items():
    env = svc.get("environment") or {}
    if isinstance(env, list):
        env = dict(e.split("=", 1) if "=" in e else (e, "") for e in env)
    for key, want in local_host.items():
        val = env.get(key)
        if val not in (None, "", want):
            out.append("%s %s=%s (must be the candidate %r service)" % (name, key, val, want))
    if env.get("DATABASE_URL"):
        out.append("%s DATABASE_URL is set (candidate uses DB_HOST=database only)" % name)
    redis = env.get("REDIS_URL") or ""
    if redis and not re.match(r"^redis://redis:6379(/\d+)?$", redis):
        out.append("%s REDIS_URL=%s (must be redis://redis:6379)" % (name, redis))
    for broker in filter(None, (env.get("KAFKA_BROKERS") or "").split(",")):
        if not broker.strip().startswith("kafka:"):
            out.append("%s KAFKA_BROKERS includes %s (only the candidate kafka service)" % (name, broker.strip()))
print("\n".join(out))
'
}

# Copies the manually migrated baseline volume into this run's (new) db-data volume.
# File copy only: no SQL runs, the baseline is mounted read-only and never modified.
clone_baseline_db_volume() {
  local project="$1" baseline="${ST_CANDIDATE_DB_BASELINE_VOLUME:-}"
  if [ -z "$baseline" ]; then
    log "ST_CANDIDATE_DB_BASELINE_VOLUME not set: candidate DB is bootstrap-only and the schema gate will fail"
    return 0
  fi
  local label target="${project}_db-data"
  label="$(docker volume inspect -f '{{ index .Labels "com.donehai.candidate-db-baseline" }}' "$baseline" 2>/dev/null)" \
    || fail "baseline volume $baseline does not exist (see app deployment/st-ci/CANDIDATE_DATABASE.md, Manual prerequisite)"
  [ "$label" = "true" ] || fail "baseline volume $baseline lacks label com.donehai.candidate-db-baseline=true; refusing to use it"
  if docker volume inspect "$target" >/dev/null 2>&1; then
    fail "candidate DB volume $target already exists; refusing to overwrite"
  fi
  docker volume create \
    --label "com.docker.compose.project=$project" \
    --label "com.docker.compose.volume=db-data" \
    --label "com.donehai.candidate-db-cloned-from=$baseline" \
    "$target" >/dev/null || fail "cannot create candidate DB volume $target"
  log "cloning baseline volume $baseline -> $target (read-only source, no SQL executed)"
  docker run --rm --network none --user 0 --entrypoint sh \
    -v "$baseline:/from:ro" -v "$target:/to" "${project}-database" \
    -c 'cp -a /from/. /to/' || fail "failed to clone baseline volume $baseline into $target"
}

schema_paths_from_file() {
  local file="$1" p
  while IFS= read -r p || [ -n "$p" ]; do
    p="${p%$'\r'}"
    case "$p" in ''|'#'*) continue ;; esac
    printf '%s\n' "$p"
  done <"$file"
}

# True when <migrated_sha> is an ancestor of <app_sha> and no schema path changed between them.
schema_baseline_is_current() {
  local repo="$1" migrated="$2" app_sha="$3"
  local list="$repo/deployment/st-ci/candidate-schema-paths.txt"
  [ -r "$list" ] || { log_err "missing $list in app repo at $app_sha"; return 1; }
  if ! git -C "$repo" cat-file -e "${migrated}^{commit}" 2>/dev/null; then
    git -C "$repo" fetch --quiet origin "$migrated" 2>/dev/null \
      || { log_err "cannot fetch baseline migration commit $migrated"; return 1; }
  fi
  git -C "$repo" merge-base --is-ancestor "$migrated" "$app_sha" \
    || { log_err "baseline was migrated from $migrated, which is not an ancestor of $app_sha"; return 1; }
  local paths=()
  mapfile -t paths < <(schema_paths_from_file "$list")
  [ "${#paths[@]}" -gt 0 ] || { log_err "$list lists no paths"; return 1; }
  if ! git -C "$repo" diff --quiet "$migrated" "$app_sha" -- "${paths[@]}"; then
    log_err "schema files changed between baseline $migrated and $app_sha:"
    git -C "$repo" diff --stat "$migrated" "$app_sha" -- "${paths[@]}" >&2 || true
    return 1
  fi
}

# Prints the gate verdict for one CANDIDATE_SCHEMA_GATE line; returns 0 only for ok.
schema_gate_verdict() {
  local line="$1" repo="$2" app_sha="$3" status migrated
  status="$(sed -n 's/^CANDIDATE_SCHEMA_GATE status=\([a-z_]*\).*/\1/p' <<<"$line")"
  if [ -z "$status" ]; then echo gate_error; return 1; fi
  if [ "$status" != ok ]; then echo "$status"; return 1; fi
  migrated="$(sed -n 's/.* migrated_from_sha=\([0-9a-f]\{40\}\)\( .*\)\{0,1\}$/\1/p' <<<"$line")"
  if [ -z "$migrated" ]; then echo gate_error; return 1; fi
  if ! schema_baseline_is_current "$repo" "$migrated" "$app_sha"; then echo stale; return 1; fi
  echo ok
}

schema_gate_hint() {
  case "$1" in
    not_candidate) echo "no donehai_candidate marker: this is not a candidate database; investigate before anything else" ;;
    not_migrated) echo "candidate DB is bootstrap-only; prepare the manually migrated baseline and set ST_CANDIDATE_DB_BASELINE_VOLUME (app deployment/st-ci/CANDIDATE_DATABASE.md, Manual prerequisite)" ;;
    missing_relations) echo "baseline is missing tables the E2E suite needs; re-run the manual migration on the baseline" ;;
    missing_fixtures) echo "baseline lacks the fixed-OTP QA accounts; apply deployment/st-ci/candidate-seeds/10-fixed-otp-test-accounts.sql to the baseline" ;;
    stale) echo "schema files changed since the baseline was migrated; refresh the baseline from this app SHA (Manual prerequisite)" ;;
    *) echo "schema gate did not produce a result; check 'docker compose logs database'" ;;
  esac
}

# Runs the app's read-only gate inside the candidate's own database container.
run_schema_gate() {
  local project="$1" app_sha="$2" gate="$ST_APP_WORKTREE/deployment/st-ci/check-candidate-schema.sql" line
  [ -r "$gate" ] || { echo gate_error; return 1; }
  line="$(candidate_compose "$project" exec -T -e PGOPTIONS='-c default_transaction_read_only=on' database \
      sh -c 'psql -X -At --no-psqlrc -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <"$gate" 2>&1 \
    | grep -o 'CANDIDATE_SCHEMA_GATE .*' | tail -n 1)"
  log "schema gate: ${line:-<no CANDIDATE_SCHEMA_GATE line>}" >&2
  schema_gate_verdict "$line" "$ST_APP_WORKTREE" "$app_sha"
}

http_code() {
  local url="$1"
  curl -q -sS -o /dev/null -w '%{http_code}' -m 15 "$url" 2>/dev/null || echo "000"
}

cmd_health_candidate() {
  load_profile
  local app_code api_code srv_code
  app_code=$(http_code "http://127.0.0.1:${ST_CANDIDATE_WEB_PORT}/")
  api_code=$(http_code "http://127.0.0.1:${ST_CANDIDATE_API_PORT}/health")
  srv_code=$(http_code "http://127.0.0.1:${ST_CANDIDATE_SERVER_PORT}/health")
  log "candidate health web=$app_code api=$api_code server=$srv_code"
  [[ "$app_code" =~ ^[23] ]] && [[ "$api_code" =~ ^[23] ]] && [[ "$srv_code" =~ ^[23] ]]
}

cmd_verify_otp_account() {
  local identifier="${1:-}"
  [ -n "$identifier" ] || fail "verify-otp-account needs the test identifier"
  load_profile
  local body code
  body="$(mktemp)"
  code=$(curl -q -sS -o "$body" -w '%{http_code}' -m 30 \
    -H 'Content-Type: application/json' \
    -d "{\"identifier\":\"$identifier\",\"method\":\"email\"}" \
    "http://127.0.0.1:${ST_CANDIDATE_API_PORT}/api/otp-auth/check-user-access" 2>/dev/null || echo "000")
  if grep -q '"exists":false' "$body"; then
    rm -f "$body"
    fail "candidate DB has no account for the test identifier; add it to the manually prepared candidate baseline (app deployment/st-ci/CANDIDATE_DATABASE.md)"
  fi
  rm -f "$body"
  [[ "$code" =~ ^2 ]] || fail "OTP account check returned HTTP $code"
  log "fixed-OTP test account is present on the candidate (HTTP $code)"
}

cmd_record_result() {
  local candidate_id="${1:-}" result="${2:-}"
  [ -n "$candidate_id" ] || fail "record-result needs candidate_id"
  case "$result" in passed|failed) ;; *) fail "record-result: result must be passed|failed" ;; esac
  load_profile
  local m
  m="$(manifest_path "$candidate_id")"
  [ -r "${m%.json}.env" ] || fail "no manifest for $candidate_id"
  # shellcheck disable=SC1090
  source "${m%.json}.env"
  write_deployment_manifest "$m" "$M_APP_REPOSITORY" "$M_APP_COMMIT_SHA" "$M_AUTOMATION_COMMIT_SHA" \
    "$M_CANDIDATE_ID" "$M_TRAFFIC_SWITCH" "$M_DB_INIT_STATUS" "$result" \
    || fail "cannot record Playwright result in $m"
  cat "$m"
}

cmd_health_public() {
  local app_code api_code
  app_code=$(http_code "https://app.st.donehai.com/")
  api_code=$(http_code "https://api.st.donehai.com/health")
  log "public ST health app=$app_code api=$api_code"
  [[ "$app_code" =~ ^[23] ]] && [[ "$api_code" =~ ^[23] ]]
}

cmd_deploy() {
  local app_sha="$1"
  local auto_sha="$2"
  local app_repo="$3"
  validate_full_sha "$app_sha" "app commit" || exit 1
  validate_full_sha "$auto_sha" "automation commit" || exit 1

  acquire_lock
  load_profile
  : "${ST_APP_CANDIDATE_COMPOSE_FILE:?ST_APP_CANDIDATE_COMPOSE_FILE required in profile}"

  # Unique per run: a fresh project means fresh volumes (bootstrap-only or a clone of the baseline).
  local short="${app_sha:0:12}"
  local run_id="${ST_CANDIDATE_RUN_ID:-$(date -u +%Y%m%d%H%M%S)}"
  local project
  project="$(printf 'donehai-candidate-%s-%s' "$short" "$run_id" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-')"
  project="${project%-}"
  ST_CANDIDATE_COMPOSE_PROJECT="$project"
  export ST_CANDIDATE_COMPOSE_PROJECT

  ST_CANDIDATE_COMPOSE_PROJECT_OVERRIDE="$project" ST_CANDIDATE_PROFILE="$ST_CANDIDATE_PROFILE" \
    bash "$SCRIPT_DIR/isolation-guard.sh" || fail "isolation guard failed"

  checkout_app_exact_sha "$app_sha"
  [ -f "$ST_APP_WORKTREE/$ST_APP_CANDIDATE_COMPOSE_FILE" ] \
    || fail "missing $ST_APP_CANDIDATE_COMPOSE_FILE in app repo at $app_sha (app-side change required)"

  export_candidate_env "$project"

  # Fail closed if any candidate named volume resolves to a protected live volume.
  local compose_json volume_name protected_volume violations
  compose_json="$(candidate_compose "$project" config --format json)" || fail "cannot resolve candidate Compose config"
  while IFS= read -r volume_name; do
    [ -n "$volume_name" ] || continue
    while IFS= read -r protected_volume; do
      [ -n "$protected_volume" ] || continue
      [ "$volume_name" != "$protected_volume" ] || fail "candidate volume collides with protected live volume: $volume_name"
    done < <(printf '%s\n' "$ST_LIVE_PROTECTED_VOLUMES" | tr ',' '\n')
  done < <(printf '%s' "$compose_json" | python3 -c 'import json,sys; d=json.load(sys.stdin); [print(v.get("name", k)) for k,v in d.get("volumes", {}).items()]')
  # Fail closed if the resolved config points any service at a live dependency.
  violations="$(printf '%s' "$compose_json" | candidate_dependency_violations)" \
    || fail "cannot check candidate dependencies"
  [ -z "$violations" ] || fail "candidate config references live/external dependencies: $(printf '%s' "$violations" | tr '\n' ';')"

  local m
  m="$(manifest_path "$project")"
  write_deployment_manifest "$m" "$app_repo" "$app_sha" "$auto_sha" "$project" "false" "pending" "pending" \
    || fail "cannot write candidate manifest $m"
  # Emit the id before the long build so the workflow can always clean up.
  printf 'CANDIDATE_ID=%s\n' "$project"

  log "building candidate compose project=$project from $ST_APP_CANDIDATE_COMPOSE_FILE"
  candidate_compose "$project" build || fail "candidate build failed"
  clone_baseline_db_volume "$project"

  # Database and Redis only: no application service starts before the manual schema
  # prerequisite is confirmed. The pipeline never applies migrations itself.
  candidate_compose "$project" up -d --wait --wait-timeout "${ST_CANDIDATE_WAIT_TIMEOUT:-2700}" database redis \
    || { candidate_compose "$project" ps || true; fail "candidate database/redis did not become healthy"; }

  local db_status
  db_status="$(run_schema_gate "$project" "$app_sha")"
  write_deployment_manifest "$m" "$app_repo" "$app_sha" "$auto_sha" "$project" "false" "$db_status" "pending" \
    || fail "cannot write candidate manifest $m"
  printf 'DB_INIT_STATUS=%s\n' "$db_status"
  [ "$db_status" = "ok" ] || fail "schema prerequisite not satisfied (status=$db_status): $(schema_gate_hint "$db_status")"

  candidate_compose "$project" up -d --wait --wait-timeout "${ST_CANDIDATE_WAIT_TIMEOUT:-2700}" \
    || { candidate_compose "$project" ps || true; fail "candidate did not become healthy"; }
  cmd_health_candidate || fail "candidate health checks failed after start"

  printf 'CANDIDATE_APP_URL=http://127.0.0.1:%s/\n' "$ST_CANDIDATE_WEB_PORT"
  printf 'CANDIDATE_API_URL=http://127.0.0.1:%s/\n' "$ST_CANDIDATE_API_PORT"
  printf 'APP_COMMIT_SHA=%s\n' "$app_sha"
  printf 'AUTOMATION_COMMIT_SHA=%s\n' "$auto_sha"
}

# Live ST volumes and the manually prepared candidate baseline are never removed.
is_protected_volume() {
  local name="$1" p
  [ -n "${ST_CANDIDATE_DB_BASELINE_VOLUME:-}" ] && [ "$name" = "$ST_CANDIDATE_DB_BASELINE_VOLUME" ] && return 0
  while IFS= read -r p; do
    [ -n "$p" ] && [ "$name" = "$p" ] && return 0
  done < <(printf '%s\n' "${ST_LIVE_PROTECTED_VOLUMES:-}" | tr ',' '\n')
  return 1
}

cmd_cleanup_candidate() {
  # Read before load_profile: the profile's placeholder project must not replace the real id.
  local project="${ST_CANDIDATE_COMPOSE_PROJECT:-}"
  load_profile
  [ -n "$project" ] || fail "ST_CANDIDATE_COMPOSE_PROJECT not set"
  case "$project" in
    donehai-candidate-*) ;;
    *) fail "refusing cleanup: $project is not a donehai-candidate-* project" ;;
  esac

  if [ "${ST_ACTIVE_STACK_LABEL:-}" = "$project" ] || [ "${ST_LIVE_COMPOSE_PROJECT:-}" = "$project" ]; then
    fail "refusing cleanup: project appears to be the active/live stack ($project)"
  fi

  log "removing candidate project $project (live stack untouched)"
  local ids vols nets imgs
  ids="$(docker ps -aq --filter "label=com.docker.compose.project=$project" 2>/dev/null || true)"
  [ -n "$ids" ] && docker rm -f $ids >/dev/null 2>&1 || true
  local v
  vols="$(docker volume ls -q --filter "label=com.docker.compose.project=$project" 2>/dev/null || true)"
  for v in $vols; do
    if is_protected_volume "$v"; then
      log_err "not removing protected volume $v (labelled with candidate project $project)"
      continue
    fi
    docker volume rm "$v" >/dev/null 2>&1 || true
  done
  nets="$(docker network ls -q --filter "label=com.docker.compose.project=$project" 2>/dev/null || true)"
  [ -n "$nets" ] && docker network rm $nets >/dev/null 2>&1 || true
  imgs="$(docker image ls -q --filter "label=com.docker.compose.project=$project" 2>/dev/null || true)"
  [ -n "$imgs" ] && docker image rm -f $imgs >/dev/null 2>&1 || true
  log "candidate cleanup finished"
}

cmd_switch_traffic() {
  if [ "${ST_TRAFFIC_SWITCH_ENABLED:-0}" != "1" ]; then
    fail "traffic switch disabled (ST_TRAFFIC_SWITCH_ENABLED != 1). Validate isolation and rollback first."
  fi
  if [ "${ST_ISOLATION_PROFILE_VALIDATED:-0}" != "1" ]; then
    fail "ST_ISOLATION_PROFILE_VALIDATED must be 1 before switching ST traffic"
  fi

  local project="${ST_CANDIDATE_COMPOSE_PROJECT:-}"
  load_profile
  [ -n "$project" ] || fail "ST_CANDIDATE_COMPOSE_PROJECT not set"
  local m
  m="$(manifest_path "$project")"
  [ -r "${m%.json}.env" ] || fail "no manifest for $project; refusing to switch"
  # shellcheck disable=SC1090
  source "${m%.json}.env"
  [ "${M_DB_INIT_STATUS:-}" = "ok" ] || fail "refusing to switch: db_init_status=${M_DB_INIT_STATUS:-unknown}"
  [ "${M_PLAYWRIGHT_RESULT:-}" = "passed" ] || fail "refusing to switch: playwright_result=${M_PLAYWRIGHT_RESULT:-unknown}"

  local switch_script="${ST_TRAFFIC_SWITCH_SCRIPT:-}"
  [ -x "$switch_script" ] || fail "ST_TRAFFIC_SWITCH_SCRIPT must be an executable script from discovery (not bundled)"

  acquire_lock
  log "preserving previous upstream for rollback"
  "$switch_script" save-previous || fail "failed to save rollback snapshot"

  "$switch_script" apply-candidate \
    "$ST_CANDIDATE_WEB_PORT" "$ST_CANDIDATE_API_PORT" || fail "traffic switch failed"

  if ! cmd_health_public; then
    log_err "post-switch public health failed; rolling back"
    "$switch_script" rollback || fail "rollback failed after unhealthy switch"
    fail "traffic switch rolled back due to failed public health checks"
  fi

  write_deployment_manifest "$m" "$M_APP_REPOSITORY" "$M_APP_COMMIT_SHA" "$M_AUTOMATION_COMMIT_SHA" \
    "$M_CANDIDATE_ID" "true" "$M_DB_INIT_STATUS" "$M_PLAYWRIGHT_RESULT" \
    || fail "traffic switched to $project but the manifest $m could not be updated"
  log "ST traffic now served by candidate (previous version preserved for rollback)"
}

cmd_rollback_traffic() {
  local switch_script="${ST_TRAFFIC_SWITCH_SCRIPT:-}"
  [ -x "$switch_script" ] || fail "ST_TRAFFIC_SWITCH_SCRIPT not configured"
  acquire_lock
  "$switch_script" rollback || fail "rollback failed"
  cmd_health_public || fail "public health failed after rollback"
  log "rollback complete"
}

cmd_record_manifest() {
  write_deployment_manifest "$1" "$2" "$3" "$4" "$5" "${6:-false}" || fail "cannot write manifest $1"
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    deploy) cmd_deploy "$@" ;;
    health-candidate) cmd_health_candidate ;;
    verify-otp-account) cmd_verify_otp_account "$@" ;;
    record-result) cmd_record_result "$@" ;;
    health-public) cmd_health_public ;;
    cleanup-candidate) cmd_cleanup_candidate ;;
    switch-traffic) cmd_switch_traffic ;;
    rollback-traffic) cmd_rollback_traffic ;;
    record-manifest) cmd_record_manifest "$@" ;;
    -h|--help|"") usage ;;
    *) fail "unknown command: $cmd" ;;
  esac
}

# Sourced by self-test.sh to exercise individual functions.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi

#!/usr/bin/env bash
# Record immutable deployment metadata (no secrets).
set -u

_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=log.sh
source "$_LIB_DIR/log.sh"

# write_deployment_manifest <path> <app_repo> <app_sha> <automation_sha> <candidate_id>
#   [traffic_switch=false] [db_init_status=unknown] [playwright_result=pending]
# Also writes <path without .json>.env (shell-readable copy used by later lifecycle steps).
# Both files are written to temp files and renamed; returns non-zero (and logs) on any failure.
write_deployment_manifest() {
  local path="$1"
  local app_repo="$2"
  local app_sha="$3"
  local automation_sha="$4"
  local candidate_id="$5"
  local traffic_switch="${6:-false}"
  local db_init_status="${7:-unknown}"
  local playwright_result="${8:-pending}"
  local dir
  dir="$(dirname "$path")"

  if ! mkdir -p "$dir" 2>/dev/null || [ ! -w "$dir" ]; then
    log_err "manifest directory is not writable by $(id -un 2>/dev/null || echo '?'): $dir (set ST_DEPLOY_STATE_DIR)"
    return 1
  fi
  if ! (
    umask 077
    tmp_json="$(mktemp "$dir/.manifest.XXXXXX")" || exit 1
    tmp_env="$(mktemp "$dir/.manifest-env.XXXXXX")" || { rm -f "$tmp_json"; exit 1; }
    trap 'rm -f "$tmp_json" "$tmp_env"' EXIT
    cat >"$tmp_json" <<EOF || exit 1
{
  "recorded_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "app_repository": "$app_repo",
  "app_commit_sha": "$app_sha",
  "automation_commit_sha": "$automation_sha",
  "candidate_id": "$candidate_id",
  "db_init_status": "$db_init_status",
  "playwright_result": "$playwright_result",
  "traffic_switch_requested": $traffic_switch
}
EOF
    cat >"$tmp_env" <<EOF || exit 1
M_APP_REPOSITORY='$app_repo'
M_APP_COMMIT_SHA='$app_sha'
M_AUTOMATION_COMMIT_SHA='$automation_sha'
M_CANDIDATE_ID='$candidate_id'
M_TRAFFIC_SWITCH='$traffic_switch'
M_DB_INIT_STATUS='$db_init_status'
M_PLAYWRIGHT_RESULT='$playwright_result'
EOF
    mv -f "$tmp_env" "${path%.json}.env" && mv -f "$tmp_json" "$path"
  ); then
    log_err "failed to write deployment manifest: $path"
    return 1
  fi
  log "wrote deployment manifest (no secrets): $path"
}

validate_full_sha() {
  local sha="$1"
  local label="$2"
  if [[ ! "$sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
    log_err "$label must be a full 40-character git commit SHA; got length ${#sha}"
    return 1
  fi
}

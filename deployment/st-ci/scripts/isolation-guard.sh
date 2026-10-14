#!/usr/bin/env bash
# Fail closed before candidate build/start if isolation cannot be guaranteed.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/log.sh
source "$SCRIPT_DIR/lib/log.sh"

fail() {
  log_err "$*"
  exit 1
}

# Comma-separated lists in profile.
split_csv() {
  local s="$1"
  local IFS=,
  read -ra _parts <<<"$s"
  printf '%s\n' "${_parts[@]}"
}

guard_isolation() {
  local profile="${ST_CANDIDATE_PROFILE:-}"
  [ -n "$profile" ] && [ -r "$profile" ] || fail "ST_CANDIDATE_PROFILE must point to a readable candidate.profile (see candidate.profile.example)."

  # shellcheck disable=SC1090
  source "$profile"
  # candidate-lifecycle.sh computes a unique per-run project name.
  ST_CANDIDATE_COMPOSE_PROJECT="${ST_CANDIDATE_COMPOSE_PROJECT_OVERRIDE:-${ST_CANDIDATE_COMPOSE_PROJECT:-}}"

  : "${ST_LIVE_COMPOSE_PROJECT:?ST_LIVE_COMPOSE_PROJECT required in profile}"
  : "${ST_CANDIDATE_COMPOSE_PROJECT:?ST_CANDIDATE_COMPOSE_PROJECT required in profile}"
  : "${ST_LIVE_PROTECTED_VOLUMES:?ST_LIVE_PROTECTED_VOLUMES required in profile}"
  : "${ST_CANDIDATE_WEB_PORT:?}"
  : "${ST_CANDIDATE_API_PORT:?}"
  : "${ST_CANDIDATE_SERVER_PORT:?}"
  : "${ST_LIVE_WEB_PORT:?}"
  : "${ST_LIVE_API_PORT:?}"
  : "${ST_LIVE_SERVER_PORT:?}"

  if [ "$ST_CANDIDATE_COMPOSE_PROJECT" = "$ST_LIVE_COMPOSE_PROJECT" ]; then
    fail "candidate compose project must differ from live ST project ($ST_LIVE_COMPOSE_PROJECT)"
  fi

  case "$ST_CANDIDATE_COMPOSE_PROJECT" in
    donehai-candidate-* ) ;;
    * ) fail "ST_CANDIDATE_COMPOSE_PROJECT must match donehai-candidate-* (got $ST_CANDIDATE_COMPOSE_PROJECT)" ;;
  esac

  for port in "$ST_CANDIDATE_WEB_PORT" "$ST_CANDIDATE_API_PORT" "$ST_CANDIDATE_SERVER_PORT" \
              "${ST_CANDIDATE_NOTIFICATION_PORT:-13012}" "${ST_CANDIDATE_KNOWLEDGE_PORT:-13003}"; do
    for live in "$ST_LIVE_WEB_PORT" "$ST_LIVE_API_PORT" "$ST_LIVE_SERVER_PORT" 3003 3012; do
      [ "$port" = "$live" ] && fail "candidate port $port collides with live or reserved port $live"
    done
  done

  if [ "${ST_CANDIDATE_USE_LIVE_DATABASE:-0}" = "1" ] || [ "${ST_CANDIDATE_USE_LIVE_REDIS:-0}" = "1" ] || [ "${ST_CANDIDATE_USE_LIVE_KAFKA:-0}" = "1" ]; then
    fail "candidate must not reuse live database, Redis, or Kafka (flags must remain 0)"
  fi

  if [ -z "${ST_CANDIDATE_DATABASE_URL:-}" ]; then
    fail "ST_CANDIDATE_DATABASE_URL must be set to an isolated database (empty/unset is not allowed)"
  fi

  case "$ST_CANDIDATE_DATABASE_URL" in
    *"@db:"*|*"@postgres:"*|*"/deployment_"*|*":5432/deployment"*|*"$ST_LIVE_COMPOSE_PROJECT"*)
      fail "ST_CANDIDATE_DATABASE_URL appears to reference live ST data resources"
      ;;
  esac

  if [ -z "${ST_CANDIDATE_REDIS_URL:-}" ]; then
    fail "ST_CANDIDATE_REDIS_URL must be set for an isolated Redis instance"
  fi

  if [ -z "${ST_CANDIDATE_KAFKA_CONSUMER_GROUP_PREFIX:-}" ]; then
    fail "ST_CANDIDATE_KAFKA_CONSUMER_GROUP_PREFIX must be set (unique per candidate)"
  fi

  case "$ST_CANDIDATE_KAFKA_CONSUMER_GROUP_PREFIX" in
    *live*|*production*|*deployment*)
      fail "Kafka consumer group prefix must not resemble live/production groups"
      ;;
  esac

  if [ "${ST_CANDIDATE_SIDE_EFFECTS_SUPPRESSED:-0}" != "1" ]; then
    fail "ST_CANDIDATE_SIDE_EFFECTS_SUPPRESSED must be 1 (external webhooks/SMS/email/payments disabled for candidate)"
  fi

  if [ "${ST_CANDIDATE_MIGRATIONS_ALLOWED:-0}" != "1" ] && [ "${ST_CANDIDATE_DB_SEED_ONLY:-0}" != "1" ]; then
    fail "set ST_CANDIDATE_MIGRATIONS_ALLOWED=1 or ST_CANDIDATE_DB_SEED_ONLY=1 after validating isolated DB init"
  fi

  # Live protected volumes are expected to exist. Isolation is enforced by
  # candidate-only Compose project naming and the explicit live-resource guards
  # above; existence of a protected live volume alone is not a deployment error.

  log "isolation guard passed for project $ST_CANDIDATE_COMPOSE_PROJECT"
}

if [ "${1:-}" = "--self-test" ]; then
  export ST_CANDIDATE_PROFILE="$SCRIPT_DIR/../fixtures/isolation-guard.profile"
  guard_isolation
  log "isolation-guard self-test passed"
  exit 0
fi

guard_isolation

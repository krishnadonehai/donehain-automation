#!/usr/bin/env bash
# Safe logging: never print values from sensitive env vars.
set -u

_SENSITIVE_PATTERN='(PASSWORD|PASSWD|PWD|SECRET|TOKEN|OTP|KEY|DSN|CREDENTIAL|PRIVATE|AUTHORIZATION|COOKIE|SSH|BEARER)'

log() {
  printf '[st-ci] %s\n' "$*"
}

log_err() {
  printf '[st-ci] ERROR: %s\n' "$*" >&2
}

# Redact obvious secret-bearing lines before printing command output.
redact_stream() {
  sed -E \
    -e 's#(://)[^/@[:space:]]+@#\1[REDACTED]@#g' \
    -e 's#((pass(word|wd)?|pwd|secret|token|api[_-]?key|otp|test_otp|test_identifier|private[_-]?key|client[_-]?secret|credential|dsn)[A-Za-z0-9_.-]*["'"'"']?[[:space:]]*[=:][[:space:]]*)[^[:space:],;]+#\1[REDACTED]#Ig' \
    -e 's#(bearer|basic)[[:space:]]+[A-Za-z0-9+/=._~-]{8,}#\1 [REDACTED]#Ig'
}

require_cmd() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || {
      log_err "missing required command: $c"
      return 1
    }
  done
}

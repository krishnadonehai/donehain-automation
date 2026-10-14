#!/usr/bin/env bash
# Generate Playwright .env at runtime without printing secret values.
set -u

ROOT="${1:-.}"
ENV_FILE="$ROOT/.env"

for var in BASE_URL TEST_IDENTIFIER TEST_OTP; do
  if [ -z "${!var:-}" ]; then
    echo "Error: $var is not set in the environment." >&2
    exit 1
  fi
done

if ! [[ "$TEST_OTP" =~ ^[0-9]{6}$ ]]; then
  echo "Error: TEST_OTP must be six digits." >&2
  exit 1
fi

umask 077
cat >"$ENV_FILE" <<EOF
BASE_URL=${BASE_URL}
TEST_IDENTIFIER=${TEST_IDENTIFIER}
TEST_OTP=${TEST_OTP}
HEADLESS=${HEADLESS:-true}
SLOW_MO=${SLOW_MO:-0}
EOF
echo "Wrote $ENV_FILE (secrets not printed)."

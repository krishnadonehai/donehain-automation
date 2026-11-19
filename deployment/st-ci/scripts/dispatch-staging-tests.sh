#!/usr/bin/env bash
# Run this on the Hostinger VPS after a successful staging deploy:
#   docker compose up -d --build
#   bash dispatch-staging-tests.sh
#
# The token is not stored in git. On the VPS:
#   printf 'AUTOMATION_DISPATCH_TOKEN=github_pat_...\n' > ~/.donehai-dispatch.env
#   chmod 600 ~/.donehai-dispatch.env
# The token needs access only to krishnadonehai/donehain-automation,
# with Contents read and write, so it can send repository_dispatch.
set -euo pipefail

ENV_FILE="${DONEHAI_DISPATCH_ENV:-$HOME/.donehai-dispatch.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ -z "${AUTOMATION_DISPATCH_TOKEN:-}" ]; then
  echo "AUTOMATION_DISPATCH_TOKEN is missing. Put it in ${ENV_FILE} (chmod 600)." >&2
  exit 1
fi

STAGING_URL="${STAGING_URL:-https://app.st.donehai.com}"
AUTOMATION_REPO="${AUTOMATION_REPO:-krishnadonehai/donehain-automation}"
READY_TIMEOUT="${READY_TIMEOUT:-180}"
deadline=$((SECONDS + READY_TIMEOUT))

echo "Waiting for ${STAGING_URL} (timeout ${READY_TIMEOUT}s)."
until curl --fail --silent --show-error --max-time 15 -o /dev/null "${STAGING_URL}/"; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Staging did not respond. Playwright was not triggered." >&2
    exit 1
  fi
  sleep 5
done

echo "Staging responded. Dispatching run-staging-tests to ${AUTOMATION_REPO}."
curl --fail --silent --show-error \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${AUTOMATION_DISPATCH_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${AUTOMATION_REPO}/dispatches" \
  -d '{"event_type":"run-staging-tests"}'

echo "Dispatched. GitHub Actions will run login and attendance against staging."

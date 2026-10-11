#!/bin/bash
# Prepares Claude Code cloud sessions: npm dependencies for check, look and
# mech:check, and a Chromium that Playwright (tests, captures, browser MCP
# servers) can actually launch.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm install (not ci) reuses the cached container's node_modules.
npm install --no-audit --no-fund

# Playwright pins its own Chromium build; cloud images ship a different build
# under /opt/pw-browsers. Point Playwright at that one only when the pinned
# browser cannot launch.
if [ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ] &&
  ! timeout 60 node -e 'require("@playwright/test").chromium.launch().then((b) => b.close())' >/dev/null 2>&1 &&
  [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium' >>"$CLAUDE_ENV_FILE"
  echo "Playwright will use /opt/pw-browsers/chromium (pinned browser unavailable)." >&2
fi

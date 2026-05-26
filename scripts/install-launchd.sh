#!/usr/bin/env bash
set -euo pipefail

LABEL="com.jerry.larkbot"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
USER_ID="$(id -u)"

if [[ -z "${NODE_BIN}" ]]; then
  echo "node was not found in PATH. Install Node.js 20+ first."
  exit 1
fi

if [[ ! -f "${PROJECT_DIR}/.env" ]]; then
  echo "Missing ${PROJECT_DIR}/.env. Run npm run setup before installing launchd."
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents"
mkdir -p "${PROJECT_DIR}/logs"

echo "Building bot..."
(cd "${PROJECT_DIR}" && npm run build)

cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${PROJECT_DIR}/dist/ws.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>StandardOutPath</key>
    <string>${PROJECT_DIR}/logs/larkbot.log</string>

    <key>StandardErrorPath</key>
    <string>${PROJECT_DIR}/logs/larkbot.error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$(dirname "${NODE_BIN}"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
PLIST

plutil -lint "${PLIST_PATH}" >/dev/null

launchctl bootout "gui/${USER_ID}" "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${USER_ID}" "${PLIST_PATH}"
launchctl enable "gui/${USER_ID}/${LABEL}"
launchctl kickstart -k "gui/${USER_ID}/${LABEL}"

echo "Installed and started ${LABEL}"
echo "Logs:"
echo "  ${PROJECT_DIR}/logs/larkbot.log"
echo "  ${PROJECT_DIR}/logs/larkbot.error.log"

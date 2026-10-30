#!/bin/bash
# TQueries launcher — double-click on macOS. Runs on this Mac; AI via local Ollama.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-4321}"; URL="http://127.0.0.1:$PORT"
for p in /opt/homebrew/bin /usr/local/bin "$HOME/.nvm/versions/node"/*/bin; do [ -x "$p/node" ] && PATH="$p:$PATH"; done
command -v node >/dev/null || { echo "Node.js is not installed. Install it once from nodejs.org (LTS)."; read -r -p "Press Return to close." _; exit 1; }
open_app() { if [ -d "/Applications/Google Chrome.app" ]; then open -na "Google Chrome" --args --app="$URL"; else open "$URL"; fi; }
if curl -s "$URL/api/state" >/dev/null 2>&1; then open_app; exit 0; fi
export PORT; node app/server.js & SERVER=$!
for _ in $(seq 1 50); do curl -s "$URL/api/state" >/dev/null 2>&1 && break; sleep 0.1; done
open_app; echo "TQueries is running at $URL — close this window to stop it."
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM; wait $SERVER

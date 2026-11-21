#!/usr/bin/env bash
# Starts the local LLM tasks console (normalize / translate / benchmark / publish the comment database).
#   ./local_llms_tasks.sh [--db path/to/comments.sqlite] [--port 8777] [--lang en|es] [--no-open]
# Needs Node 22.5 or newer (it uses the built-in node:sqlite). No installation is needed.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then echo "Node.js is required (https://nodejs.org)." >&2; exit 1; fi
major="$(node -p 'process.versions.node.split(".")[0]')"
minor="$(node -p 'process.versions.node.split(".")[1]')"
if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 5 ]; }; then
  echo "Node 22.5 or newer is required (found $(node -v))." >&2; exit 1
fi

open=1
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --no-open) open=0 ;;
    --db|--port|--lang) args+=("$1" "${2:?$1 needs a value}"); shift ;;
    -h|--help) sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

[ "$open" -eq 1 ] && args+=(--open)
exec node packages/chess-shared/scripts/llm-console/server.mjs ${args[@]+"${args[@]}"}

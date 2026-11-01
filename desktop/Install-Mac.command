#!/bin/zsh
BOARD_SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
BOARD_NODE_BIN="$(command -v node 2>/dev/null)"
if [ -z "$BOARD_NODE_BIN" ]; then
  for BOARD_CANDIDATE in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$BOARD_CANDIDATE" ]; then BOARD_NODE_BIN="$BOARD_CANDIDATE"; break; fi
  done
fi
if [ -z "$BOARD_NODE_BIN" ]; then
  print 'Please install Node.js 22 or newer: https://nodejs.org/en/download'
  read '?Press Return to close.'
  exit 1
fi
"$BOARD_NODE_BIN" "$BOARD_SCRIPT_DIR/install-mac.cjs"
read '?Press Return to close.'

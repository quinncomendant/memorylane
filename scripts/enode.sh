#!/bin/bash
# Run a command using Electron's Node.js runtime.
# Ensures native modules compiled for Electron work everywhere.
ELECTRON_RUN_AS_NODE=1 exec "$(dirname "$0")/../node_modules/.bin/electron" "$@"

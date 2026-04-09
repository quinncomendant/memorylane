# MemoryLane v0.19.1

Patch release: fixes a stuck Claude / Cursor MCP connection after upgrading from a pre-v0.18 build, and improves the CLI's diagnostics.

## What's Changed

- Fixed startup MCP migration: stale `memorylane` entries pointing at the deleted in-asar `mcp-entry.js` are now rewritten to the standalone CLI invocation, even when the original `env` block is missing
- Added a permission prompt for system notifications during screen recording (#DEU-15)
- CLI now surfaces an actionable hint when `better-sqlite3` is missing its native binary
- CLI README documents the Node LTS requirement and bindings troubleshooting steps

## Known Issues & Limitations

- Windows OCR still depends on native OCR component availability
- Intel macOS is not yet officially supported

## Installation

- macOS (Apple Silicon): install from the latest GitHub release or via the project install script
- Windows: download the latest GitHub release and use either `MemoryLane-Setup.exe` or `MemoryLane-Setup.msi`

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.19.0...v0.19.1

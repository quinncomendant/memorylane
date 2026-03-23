# MemoryLane v0.17.1

Patch release focused on safer Windows updates, clearer pattern language, and docs cleanup.

## What's Changed

- Blocked Windows auto-update installs while the MCP host is running to avoid interrupted sessions
- Updated pattern prompts and cards to prefer clearer first-person descriptions
- Refreshed the README, privacy link, and CLI/plugin documentation

## Features

- Windows update handling is safer when MemoryLane is active through MCP
- Pattern recommendations use more natural descriptions across prompts and UI cards
- The MemoryLane plugin now includes the `process-flowchart` command and skill

## Known Issues & Limitations

- Windows OCR still depends on native OCR component availability
- Linux and Intel macOS are not yet officially supported

## Installation

- macOS (Apple Silicon): install from the latest GitHub release or via the project install script
- Windows: download the latest GitHub release and use either `MemoryLane-Setup.exe` or `MemoryLane-Setup.msi`

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.17.0...v0.17.1

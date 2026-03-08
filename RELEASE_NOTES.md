# MemoryLane v0.14.1

Patch release focused on clearer tray feedback when capture is paused by privacy rules.

## What's Changed

- **Tray privacy-block status** - Added explicit tray tooltip/menu states when capture is paused by privacy rules
- **Recent-state latch** - Tray now shows a short "recently paused" status after unblocking, making transitions easier to notice
- **Release workflow maintenance** - Normalized repo-local release skill layout under `.agents/skills/release/SKILL.md`

## Features

- Tray menu now displays `Capture paused: privacy rule matched` while blocked
- Tray tooltip now reflects active and recently-cleared privacy pauses during capture

## Known Issues & Limitations

- Windows OCR still depends on native OCR component availability
- Linux and Intel macOS are not yet officially supported

## Installation

- macOS (Apple Silicon): install from the latest GitHub release or via the project install script
- Windows: download `MemoryLane-Setup.exe` from the latest GitHub release

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.14.0...v0.14.1

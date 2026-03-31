# MemoryLane v0.19.0

New stepped onboarding flow that guides users from MCP setup through first pattern detection.

## What's Changed

- Added stepped onboarding: Connect (pick MCP providers) -> Capture (progress bar) -> Dashboard
- Added `openExternal` IPC for opening links in the default browser (https-only)
- Added estimated hours per week to pattern cards
- Increased minimum activities before pattern detection from 50 to 200
- Renamed "Claude Desktop" to "Claude Cowork" in integrations
- Simplified StatusLine to show capture state with animated indicator

## Known Issues & Limitations

- Windows OCR still depends on native OCR component availability
- Intel macOS is not yet officially supported

## Installation

- macOS (Apple Silicon): install from the latest GitHub release or via the project install script
- Windows: download the latest GitHub release and use either `MemoryLane-Setup.exe` or `MemoryLane-Setup.msi`

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.18.0...v0.19.0

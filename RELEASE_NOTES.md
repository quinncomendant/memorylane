# MemoryLane v0.20.0

Enterprise edition: automatic and manual database sync to remote.

## What's Changed

- Added periodic database upload sync for enterprise edition — activated devices upload a backup to the enterprise backend every 24 hours
- Added a "Sync to Remote" button in Advanced Settings for enterprise users to trigger an upload manually
- Renamed `ENTERPRISE_LICENSE_CONFIG` to `ENTERPRISE_BACKEND_CONFIG` to reflect its broader scope

## Known Issues & Limitations

- Windows OCR still depends on native OCR component availability
- Intel macOS is not yet officially supported

## Installation

- macOS (Apple Silicon): install from the latest GitHub release or via the project install script
- Windows: download the latest GitHub release and use either `MemoryLane-Setup.exe` or `MemoryLane-Setup.msi`

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.19.1...v0.20.0

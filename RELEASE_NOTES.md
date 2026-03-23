# MemoryLane v0.17.2

Patch release: managed subscription keys refresh in the background so entitlement stays aligned with the backend.

## What's Changed

- Added a daily background refresh for provisioned API keys so subscription changes apply without restarting the app

## Features

- Managed-key subscription state stays in sync via periodic re-fetch (24-hour interval)

## Known Issues & Limitations

- Windows OCR still depends on native OCR component availability
- Linux and Intel macOS are not yet officially supported

## Installation

- macOS (Apple Silicon): install from the latest GitHub release or via the project install script
- Windows: download the latest GitHub release and use either `MemoryLane-Setup.exe` or `MemoryLane-Setup.msi`

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.17.1...v0.17.2

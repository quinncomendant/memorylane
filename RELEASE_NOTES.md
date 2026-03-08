# MemoryLane v0.14.2

Patch release focused on tray privacy-state reliability and repository maintenance.

## What's Changed

- **Tray privacy-state reliability** - Extracted tray privacy latch logic into a dedicated state module so the "recently paused" state now clears reliably after expiry
- **Tray coverage improvements** - Added focused tests for tray privacy state transitions and latch expiration behavior
- **Repository cleanup and docs** - Added a CONTRIBUTING guide, linked it from project docs, and removed obsolete notebook tooling

## Features

- Tray privacy status now transitions cleanly from paused to recently paused and back to normal without waiting for extra UI events

## Known Issues & Limitations

- Windows OCR still depends on native OCR component availability
- Linux and Intel macOS are not yet officially supported

## Installation

- macOS (Apple Silicon): install from the latest GitHub release or via the project install script
- Windows: download `MemoryLane-Setup.exe` from the latest GitHub release

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.14.1...v0.14.2

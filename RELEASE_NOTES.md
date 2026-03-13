# MemoryLane v0.15.2

Patch release focused on capture reliability, activity timing correctness, and pattern consistency.

## What's Changed

- **More reliable macOS capture** - Screenshot sidecars now restart more safely and avoid unbounded memory growth when frame writing falls behind
- **More accurate activity boundaries** - Manual capture start now schedules background analyzers correctly, typing duration calculation is fixed, and single-item sampling behaves correctly
- **Pattern consistency fixes** - Pattern counts, search results, and stored pattern state stay aligned more reliably
- **Release pipeline polish** - Release notifications are now sent to Discord with tighter workflow guards

## Features

- Safer macOS screenshot capture under crash and backpressure conditions
- Corrected activity timing and capture-start behavior in the background pipeline
- Better pattern normalization so detection, counts, and search stay in sync
- Release workflow notifications for shipped builds

## Known Issues & Limitations

- Windows OCR still depends on native OCR component availability
- Linux and Intel macOS are not yet officially supported

## Installation

- macOS (Apple Silicon): install from the latest GitHub release or via the project install script
- Windows: download the latest GitHub release and use either `MemoryLane-Setup.exe` or `MemoryLane-Setup.msi`

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.15.1...v0.15.2

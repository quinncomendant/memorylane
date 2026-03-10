# MemoryLane v0.14.3

Patch release focused on custom semantic endpoints, better privacy controls, improved release packaging, and periodic raw database export.

## What's Changed

- **Custom semantic endpoints** - OpenAI-compatible providers now work directly for semantic processing, with better provider error handling and cached video fallback decisions
- **Privacy rule matching** - App names, window titles, and URL patterns now match substrings by default, making exclusions easier to configure
- **Periodic raw DB export** - Added a settings-controlled raw SQLite export folder for regular backup snapshots alongside the existing manual ZIP export
- **CLI and plugin MCP flow** - CLI now supports MCP server mode so the plugin can work without the desktop app running
- **Windows release packaging** - Release pipeline now publishes both `MemoryLane-Setup.exe` and `MemoryLane-Setup.msi` with stable MSI naming and explicit rollout defaults

## Features

- Custom OpenAI-compatible semantic endpoints now work for activity summarization
- Privacy exclusions are easier to author because plain text patterns match substrings by default
- Raw database snapshots can be exported on a recurring basis to a user-selected folder
- CLI MCP mode lets plugin-based workflows query MemoryLane without the desktop app running
- Windows release assets include both `MemoryLane-Setup.exe` and `MemoryLane-Setup.msi`

## Known Issues & Limitations

- Windows OCR still depends on native OCR component availability
- Linux and Intel macOS are not yet officially supported

## Installation

- macOS (Apple Silicon): install from the latest GitHub release or via the project install script
- Windows: download the latest GitHub release and use either `MemoryLane-Setup.exe` or `MemoryLane-Setup.msi`

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.14.2...v0.14.3

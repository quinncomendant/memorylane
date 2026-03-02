# MemoryLane v0.13.4

MemoryLane is a macOS system tray app that captures your screen activity, processes it with OCR and AI summarization, and makes it searchable through an MCP server — giving AI assistants like Claude and Cursor memory of what you've been working on.

## What's Changed

- **Tray-only auto-start now works end to end (main update)** — packaged macOS and Windows builds can register a login item, relaunch hidden in the tray, and stay out of the way at sign-in
- **Fresh packaged installs now opt into launch at login automatically** — new users start with auto-start enabled by default, and the first packaged run syncs that preference into the OS login item
- **Capture state survives relaunches and wake-ups** — the app now persists whether capture was enabled, then restores that preference on startup and after power-state resume
- **Single-instance startup is more reliable** — a second launch now focuses the existing app window instead of creating conflicting tray behavior
- **Advanced settings now expose startup controls** — added a Launch at login toggle with clearer success/error handling when saving settings

## Features

- **Launch at login enabled by default on fresh installs** — packaged macOS and Windows builds can start automatically and remain hidden in the tray, while still being user-configurable
- **Persistent capture preference** — remembers whether capture should resume after restart or wake
- **V2 activity pipeline** — new runtime path for event/capture ingestion, activity extraction, transformation, and persistence
- **Video-first activity understanding** — stitched activity clips for richer semantic interpretation with fallback to frame snapshots
- **Pattern detection foundation** — stores reusable activity patterns for future higher-level context and analysis workflows
- **Automatic updates** — background update checks with one-click install from the tray menu
- **One-command install** — `curl | sh` installer that downloads, installs, and removes quarantine automatically
- **Apple notarized** — the app is code-signed and Apple-notarized, no Gatekeeper warnings
- **Managed API key via Stripe** — subscribe and start capturing in seconds, no OpenRouter account needed
- **Custom endpoint models** — use OpenAI-compatible endpoints, including local runtimes like Ollama
- **Multi-screen capture** — captures screenshots from all connected displays simultaneously
- **Event-driven screen capture** — captures screenshots based on user interactions (clicks, typing, scrolling, app switches) and visual changes (perceptual dHash comparison), not fixed intervals
- **Activity-based processing** — groups screenshots into coherent activity sessions for richer summaries
- **OCR via macOS Vision** — extracts text from screenshots using the native Vision framework (Swift sidecar)
- **AI-powered summarization** — classifies activity into concise summaries using vision models via OpenRouter (Mistral Small, GPT-5 Nano, Grok-4.1 Fast, Gemini Flash Lite)
- **Semantic search** — vector embeddings (all-MiniLM-L6-v2) + SQLite FTS5 for full-text and semantic search over your activity history
- **MCP server** — exposes `search_context`, `browse_timeline`, and `get_event_details` tools plus time tracking and recent activity prompts for AI assistants
- **One-click integrations** — register the MCP server with Claude Desktop or Cursor from the tray menu
- **Configurable capture and semantic settings** — adjust visual change threshold, typing timeout, scroll timeout, and semantic mode behavior via the UI
- **Secure API key storage** — uses Electron's safeStorage for encrypted key persistence
- **Usage tracking** — monitors API requests, token usage, and costs
- **Richer activity summaries** — improved summary quality for timeline and search context questions
- **Windows OCR (preview)** — native OCR path available for Windows preview setups
- **Windows app watcher integration (preview)** — recorder support for the native watcher backend with unit/e2e coverage and build packaging
- **Database export from settings** — export local data from the app UI for backup and portability

## Known Issues & Limitations

- **macOS ARM64 release artifact only** — official release assets are currently Apple Silicon macOS (`.zip` and `.dmg`)
- **Windows support is preview quality** — native OCR is available, but some OS-specific UX and setup polish are still in progress
- **Linux and Intel macOS not yet officially supported**

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/deusXmachina-dev/memorylane/main/install.sh | sh
```

This downloads the latest release and installs it to `/Applications`. No Gatekeeper warnings.

After launching:

1. Grant **Screen Recording** permission when prompted
2. Grant **Accessibility** permission when prompted
3. Choose how to provide an API key:
   - **Subscribe** _(recommended)_ — click Subscribe to get a managed key ($10/mo via Stripe)
   - **Bring Your Own Key** — paste your OpenRouter API key if you already have one
4. Optional: configure a custom model endpoint in settings (for example, a local Ollama endpoint)
5. Optionally register the MCP server with Claude Desktop or Cursor

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.13.2...v0.13.4

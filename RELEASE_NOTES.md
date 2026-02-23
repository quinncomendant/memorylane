# MemoryLane v0.12.0

MemoryLane is a macOS system tray app that captures your screen activity, processes it with OCR and AI summarization, and makes it searchable through an MCP server — giving AI assistants like Claude and Cursor memory of what you've been working on.

## What's Changed

- **V2 runtime pipeline** — introduced a full v2 activity runtime with durable streams, coordinated extraction/production stages, and richer activity lifecycle handling
- **Video-first semantic processing** — added ffmpeg-based activity video stitching and a semantic service that prefers stitched media with robust snapshot fallback behavior
- **Pattern intelligence and MCP improvements** — added pattern detection infrastructure, storage/repository support, and MCP tool/prompt enhancements for better context retrieval
- **Native capture hardening on macOS** — improved v2 screenshot capture via ScreenCaptureKit/CoreGraphics paths, focused-window display tracking, and transient-failure tolerance
- **Reliability, performance, and test depth** — reduced capture/media footprint, improved cleanup/shutdown semantics, and added broad unit/integration coverage across the v2 stack

## Features

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
- **Configurable capture settings** — adjust visual change threshold, typing timeout, scroll timeout via the UI
- **Secure API key storage** — uses Electron's safeStorage for encrypted key persistence
- **Usage tracking** — monitors API requests, token usage, and costs
- **Richer activity summaries** — improved summary quality for timeline and search context questions
- **Windows OCR (preview)** — native OCR path available for Windows preview setups

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

https://github.com/deusXmachina-dev/memorylane/compare/v0.11.0...v0.12.0

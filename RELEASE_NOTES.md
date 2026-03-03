# MemoryLane v0.13.6

MemoryLane is a desktop tray app that captures your screen activity, processes it with OCR and AI summarization, and makes it searchable through an MCP server - giving AI assistants like Claude and Cursor memory of what you've been working on. Releases are published from version tags: normal semver tags create standard releases, and suffixed versions such as `-beta.1` create prereleases.

## What's Changed

- **Release assets now use stable filenames** - macOS and Windows updater assets now publish under fixed names so `latest*.yml` and the GitHub release stay aligned
- **Release publishing is stricter** - the workflow now uploads, verifies, and publishes an explicit asset list for both platforms instead of relying on broad globs
- **The activity pipeline naming is simpler** - the runtime code was flattened out of `src/main/v2` and V2-prefixed types and functions were renamed without changing behavior
- **Dead legacy code was removed** - unused processor, recorder, and MCP indirection layers were deleted to keep the capture and search stack easier to maintain
- **Build metadata was cleaned up** - release workflow action updates and package-lock cleanup reduce noise in release builds

## Features

- **Launch at login**
- **Persistent capture preference** - remembers whether capture should resume after restart or wake
- **Unified activity pipeline** - runtime path for event/capture ingestion, activity extraction, transformation, and persistence
- **Video-first activity understanding** - stitched activity clips for richer semantic interpretation with fallback to frame snapshots
- **Pattern detection foundation** - stores reusable activity patterns for future higher-level context and analysis workflows
- **Automatic updates** - background update checks with one-click install from the tray menu
- **One-command install** - `curl | sh` installer that downloads, installs, and removes quarantine automatically
- **Apple notarized** - the app is code-signed and Apple-notarized, no Gatekeeper warnings
- **Managed API key via Stripe** - subscribe and start capturing in seconds, no OpenRouter account needed
- **Custom endpoint models** - use OpenAI-compatible endpoints, including local runtimes like Ollama
- **Multi-screen capture** - captures screenshots from all connected displays simultaneously
- **Event-driven screen capture** - captures screenshots based on user interactions (clicks, typing, scrolling, app switches) and visual changes (perceptual dHash comparison), not fixed intervals
- **Activity-based processing** - groups screenshots into coherent activity sessions for richer summaries
- **OCR via macOS Vision** - extracts text from screenshots using the native Vision framework (Swift sidecar)
- **AI-powered summarization** - classifies activity into concise summaries using vision models via OpenRouter (Mistral Small, GPT-5 Nano, Grok-4.1 Fast, Gemini Flash Lite)
- **Semantic search** - vector embeddings (all-MiniLM-L6-v2) + SQLite FTS5 for full-text and semantic search over your activity history
- **MCP server** - exposes `search_context`, `browse_timeline`, and `get_event_details` tools plus time tracking and recent activity prompts for AI assistants
- **One-click integrations** - register the MCP server with Claude Desktop or Cursor from the tray menu
- **Configurable capture and semantic settings** - adjust visual change threshold, typing timeout, scroll timeout, and semantic mode behavior via the UI
- **Secure API key storage** - uses Electron's safeStorage for encrypted key persistence
- **Usage tracking** - monitors API requests, token usage, and costs
- **Richer activity summaries** - improved summary quality for timeline and search context questions
- **Windows OCR** - native OCR path for the Windows release build
- **Windows native capture stack** - recorder support for the native watcher and screenshot backends with packaging and integration coverage
- **Database export from settings** - export local data from the app UI for backup and portability

## Known Issues & Limitations

- **macOS builds are Apple Silicon only** - official macOS release assets currently target ARM64 (`.zip` and `.dmg`)
- **Linux and Intel macOS not yet officially supported**

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/deusXmachina-dev/memorylane/main/install.sh | sh
```

This downloads the latest macOS stable release and installs it to `/Applications`. No Gatekeeper warnings.

For Windows, download `MemoryLane-Setup.exe` from the latest GitHub release.

After launching:

1. On macOS, grant **Screen Recording** permission when prompted
2. On macOS, grant **Accessibility** permission when prompted
3. Choose how to provide an API key:
   - **Subscribe** _(recommended)_ - click Subscribe to get a managed key ($10/mo via Stripe)
   - **Bring Your Own Key** - paste your OpenRouter API key if you already have one
4. Optional: configure a custom model endpoint in settings (for example, a local Ollama endpoint)
5. Optionally register the MCP server with Claude Desktop or Cursor

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.13.5...v0.13.6

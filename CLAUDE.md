# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MemoryLane is a system tray Electron application that captures screenshots at regular intervals. Built with TypeScript using electron-vite for development and electron-builder for packaging. The application runs as a tray-only app (no main window) and captures screenshots based on user interaction and visual changes.

## Development Commands

```bash
# Start development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Package the application (unpacked)
npm run package

# Create distributable packages
npm run make

# Platform-specific builds
npm run make:mac
npm run make:win
npm run make:linux

# Lint TypeScript files
npm run lint

# Run tests
npm run test
```

## Architecture

### Application Structure

This is a tray-only application (no main window). The source follows electron-vite's directory convention:

```
src/
├── main/           # Main process
│   ├── index.ts    # Entry point, tray management
│   ├── recorder/   # Screenshot capture module
│   ├── processor/  # OCR, embeddings, storage
│   └── mcp/        # MCP server integration
├── preload/        # Preload scripts
│   └── index.ts
├── renderer/       # Renderer process (minimal for tray app)
│   ├── index.html
│   ├── index.ts
│   └── index.css
└── shared/         # Shared types and constants
    ├── types.ts
    └── constants.ts
```

### Main Components

1. **Main Process** (`src/main/index.ts`): Entry point and tray management
   - Creates system tray with menu (Start/Stop Capture, Capture Now, Quit)
   - Handles app lifecycle as a tray app (doesn't quit when windows close)
   - Hides dock icon on macOS for pure tray experience
   - Integrates with recorder and processor modules

2. **Recorder Module** (`src/main/recorder/`): Screenshot capture
   - Uses Electron's `desktopCapturer` API to capture screens
   - Saves screenshots as PNG files to `{userData}/screenshots/`
   - Event-driven capture based on user interaction and visual changes
   - Exposes API for downstream consumers via callback system

3. **Processor Module** (`src/main/processor/`): Screenshot processing
   - OCR using macOS Vision framework (Swift)
   - Vector embeddings using Transformers.js
   - Storage using LanceDB for vector search

### Build System

The project uses electron-vite for development and electron-builder for packaging:

- **electron.vite.config.ts**: Unified Vite configuration
  - Configures main, preload, and renderer builds
  - Handles native module externalization
  - Source maps enabled for debugging

- **electron-builder.yml**: Packaging configuration
  - Defines targets for macOS, Windows, and Linux
  - Configures ASAR unpacking for native modules
  - Handles asset copying to resources

### Native Modules

This project uses several native Node.js modules that require special handling:

- `uiohook-napi` - Keyboard/mouse monitoring
- `sharp` - Image processing
- `@lancedb/lancedb` - Vector database
- `active-win` - Active window detection
- `onnxruntime-node` - ML inference

These are:
1. Externalized in Vite (not bundled)
2. Rebuilt for Electron via `postinstall` script
3. Unpacked from ASAR via electron-builder config

### TypeScript Configuration

- Target: ESNext
- Module: ESNext with bundler resolution
- Isolated modules enabled for Vite compatibility
- Source maps enabled for debugging

## Key Patterns

### Screen Capture API

The recorder module provides a clean interface for screenshot functionality:

```typescript
// Start/stop automatic capture
startCapture(): void  // Begins event-driven capture
stopCapture(): void   // Stops capture

// Manual capture
captureNow(): Promise<Screenshot>  // Captures immediately

// Subscribe to captures
onScreenshot(callback: OnScreenshotCallback): void  // Register callback for new screenshots

// Utility
getScreenshotsDir(): string  // Get screenshots directory path
isCapturingNow(): boolean    // Check if currently capturing
```

### Screenshot Data Structure

Each captured screenshot provides:
- `id`: UUID for the screenshot
- `filepath`: Absolute path to the PNG file
- `timestamp`: Unix timestamp in milliseconds
- `display`: Display metadata (id, width, height)
- `trigger`: Capture reason (manual, baseline_change, etc.)

### Tray App Behavior

- No main window created by default (pure tray app)
- Dock icon hidden on macOS for cleaner system tray experience
- App doesn't quit when all windows close
- Tray menu dynamically updates based on capture state

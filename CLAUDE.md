# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MemoryLane is a system tray Electron application that captures screenshots at regular intervals. Built with TypeScript and Vite, using Electron Forge as the build and packaging system. The application runs as a tray-only app (no main window) and automatically captures screenshots every 30 seconds.

## Development Commands

```bash
# Start development mode (with hot reload)
npm start

# Lint TypeScript files
npm run lint

# Package the application
npm run package

# Create distributable packages
npm run make

# Publish the application
npm run publish
```

## Architecture

### Application Structure

This is a tray-only application (no main window). The main components are:

1. **Main Process** (`src/main.ts`): Entry point and tray management
   - Creates system tray with menu (Start/Stop Capture, Capture Now, Quit)
   - Handles app lifecycle as a tray app (doesn't quit when windows close)
   - Hides dock icon on macOS for pure tray experience
   - Integrates with capture module for screenshot functionality

2. **Capture Module** (`src/main/capture.ts`): Core screenshot functionality
   - Uses Electron's `desktopCapturer` API to capture screens
   - Saves screenshots as PNG files to `{userData}/screenshots/`
   - Filename format: `{timestamp}_{uuid}.png`
   - Configurable capture interval (default: 30 seconds)
   - Exposes API for downstream consumers via callback system

3. **Shared Types** (`src/shared/`): Common interfaces and constants
   - `types.ts`: Defines `Screenshot` interface and callback types
   - `constants.ts`: Configuration values like `CAPTURE_INTERVAL_MS`

### Build System

The project uses Electron Forge with Vite plugin for building and packaging:

- **forge.config.ts**: Main Electron Forge configuration
  - Defines makers for different platforms (Squirrel/Windows, ZIP/macOS, Deb, RPM)
  - Configures Vite plugin with three build targets:
    - Main process (`vite.main.config.ts`)
    - Preload script (`vite.preload.config.ts`)
    - Renderer process (`vite.renderer.config.ts`)
  - Security fuses enabled (ASAR integrity validation, cookie encryption, etc.)

- **Vite Configs**: Three separate Vite configurations for each process type
  - All currently use default configurations
  - Can be customized per-process as needed

### TypeScript Configuration

- Target: ESNext
- Module: CommonJS (for Electron compatibility)
- noImplicitAny enabled for type safety
- Source maps enabled for debugging

## Key Patterns

### Screen Capture API

The capture module provides a clean interface for screenshot functionality:

```typescript
// Start/stop automatic capture
startCapture(): void  // Begins capturing every CAPTURE_INTERVAL_MS
stopCapture(): void   // Stops automatic capture

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

### Extending with Downstream Processing

To add processing of captured screenshots:
1. Register a callback using `capture.onScreenshot()` in `src/main.ts`
2. Process the `Screenshot` object in your callback
3. The callback receives each screenshot as it's captured
4. Access the image file via `screenshot.filepath`

### Tray App Behavior

- No main window created by default (pure tray app)
- Dock icon hidden on macOS for cleaner system tray experience
- App doesn't quit when all windows close
- Tray menu dynamically updates based on capture state

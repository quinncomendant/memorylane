# MemoryLane - Screen Capture Module

Minimal Electron tray app that captures screenshots at fixed intervals.

---

## Scope

**In scope:**
- Tray app shell
- Screenshot capture every `CAPTURE_INTERVAL_MS` 
- Save to disk
- Expose clean interface for downstream processing

**Out of scope (handled by colleague):**
- LLM processing
- Database / storage logic
- Deduplication
- Search / retrieval

---

## Contract

The screen capture module emits screenshots. Downstream consumer subscribes to them.

```typescript
// src/shared/types.ts

interface Screenshot {
  id: string;              // UUID
  filepath: string;        // Absolute path to PNG
  timestamp: number;       // Unix ms
  display: {
    id: number;
    width: number;
    height: number;
  };
}

type OnScreenshotCallback = (screenshot: Screenshot) => void;
```

### API Surface

```typescript
// src/main/capture.ts

// Configuration
const CAPTURE_INTERVAL_MS = 30_000;  // 30 seconds
const SCREENSHOTS_DIR = app.getPath('userData') + '/screenshots';

// Methods
function startCapture(): void
function stopCapture(): void
function captureNow(): Promise<Screenshot>
function onScreenshot(callback: OnScreenshotCallback): void
function getScreenshotsDir(): string
```

Colleague hooks in via `onScreenshot()` and receives each capture as it happens.

---

## File Structure

```
memorylane/
├── package.json
├── src/
│   ├── main/
│   │   ├── index.ts        # Entry, tray setup
│   │   ├── capture.ts      # Screenshot capture
│   │   └── preload.ts      # Context bridge (if needed)
│   ├── renderer/
│   │   └── index.html      # Minimal UI (just status)
│   └── shared/
│       ├── types.ts        # Screenshot interface
│       └── constants.ts    # CAPTURE_INTERVAL_MS
└── assets/
    └── tray-icon.png
```

---

## Dependencies

```json
{
  "dependencies": {
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.0.0"
  }
}
```

No sharp, no sqlite, no anthropic SDK — that's downstream.

---

## Implementation Notes

1. **Capture uses `desktopCapturer`** — built into Electron, no native deps
2. **Files saved as PNG** to `{userData}/screenshots/{timestamp}_{id}.png`
3. **Tray menu:** Start / Stop / Quit
4. **No window** needed initially, pure tray app

---

## Next Steps

1. `npm init` + install electron + typescript
2. Implement `capture.ts` with the contract above
3. Wire up tray with start/stop
4. Hand off to colleague — they subscribe via `onScreenshot()`
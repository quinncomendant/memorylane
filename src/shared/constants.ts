export const CAPTURE_INTERVAL_MS = 30_000; // 30 seconds

// Visual Change Detection Configuration
export const VISUAL_DETECTOR_CONFIG = {
  ENABLED: true,
  SAMPLE_INTERVAL_MS: 500,           // Check every 500ms
  CHANGE_THRESHOLD_PERCENT: 7.5,      // 7.5% confidence threshold
  HIGH_CONFIDENCE_THRESHOLD: 20,      // Above this = capture immediately (no debounce)
  SAMPLE_WIDTH: 320,                   // Downscale for performance
  SAMPLE_HEIGHT: 180,
  FALLBACK_TO_TIMER: true,            // Capture after N seconds regardless
  FALLBACK_TIMER_MS: 300_000,         // 5 minutes max between captures
  DEBOUNCE_MS: 15_000,                // 15 seconds debounce for low confidence changes
};

// User Interaction Monitoring Configuration
export const INTERACTION_MONITOR_CONFIG = {
  ENABLED: true,
  TRACK_CLICKS: true,
  TRACK_KEYBOARD: true,               // Track typing sessions
  TRACK_SCROLL: false,                // Covered by visual detector
  DEBOUNCE_MS: 2000,                  // 2s between captures
  CAPTURE_DELAY_MS: 500,              // Wait 500ms after click (for UI update)
  TYPING_SESSION_TIMEOUT_MS: 2000,    // Consider typing stopped after 2s of no keys
};

// Context Capture Configuration
export const CONTEXT_CAPTURE_CONFIG = {
  ENABLED: false,                     // Disabled by default (requires permissions)
  CAPTURE_ACTIVE_WINDOW: true,
  CAPTURE_UI_ELEMENTS: true,         // Requires accessibility permissions
  CAPTURE_PRE_POST_SNAPSHOTS: false,  // Doubles storage
  REQUEST_PERMISSIONS_ON_START: true,
};

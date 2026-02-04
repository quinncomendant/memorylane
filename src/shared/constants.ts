export const CAPTURE_INTERVAL_MS = 30_000; // 30 seconds (legacy fallback)

// Visual Change Detection Configuration (Event-driven baseline model)
export const VISUAL_DETECTOR_CONFIG = {
  ENABLED: true,
  DHASH_THRESHOLD_PERCENT: 6,         // Threshold for baseline comparison
  SAMPLE_WIDTH: 320,                  // Downscale for performance
  SAMPLE_HEIGHT: 180,
  FALLBACK_TIMER_MS: 300_000,         // 5 minutes max between captures
};

// User Interaction Monitoring Configuration
export const INTERACTION_MONITOR_CONFIG = {
  ENABLED: true,
  TRACK_CLICKS: true,
  TRACK_KEYBOARD: true,               // Track typing sessions
  TRACK_SCROLL: true,                 // Track scroll sessions
  TRACK_APP_CHANGE: true,             // Track application/window changes
  TYPING_SESSION_TIMEOUT_MS: 2000,    // Consider typing stopped after 2s of no keys
  SCROLL_SESSION_TIMEOUT_MS: 500,     // Consider scrolling stopped after 500ms
  APP_CHANGE_POLL_MS: 500,            // Poll active window every 500ms
};

// Context Capture Configuration
export const CONTEXT_CAPTURE_CONFIG = {
  ENABLED: false,                     // Disabled by default (requires permissions)
  CAPTURE_ACTIVE_WINDOW: true,
  CAPTURE_UI_ELEMENTS: true,         // Requires accessibility permissions
  CAPTURE_PRE_POST_SNAPSHOTS: false,  // Doubles storage
  REQUEST_PERMISSIONS_ON_START: true,
};

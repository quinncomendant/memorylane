// Visual Change Detection Configuration (Event-driven baseline model)
// These are default values - actual values come from CaptureSettingsManager
export const DEFAULT_VISUAL_DETECTOR_CONFIG = {
  ENABLED: true,
  DHASH_THRESHOLD_PERCENT: 6, // Threshold for baseline comparison (1-20%)
  SAMPLE_WIDTH: 320, // Downscale for performance
  SAMPLE_HEIGHT: 180,
}

// User Interaction Monitoring Configuration
// These are default values - actual values come from CaptureSettingsManager
export const DEFAULT_INTERACTION_MONITOR_CONFIG = {
  ENABLED: true,
  TRACK_CLICKS: true,
  TRACK_KEYBOARD: true, // Track typing sessions
  TRACK_SCROLL: true, // Track scroll sessions
  TRACK_APP_CHANGE: true, // Track application/window changes
  TYPING_SESSION_TIMEOUT_MS: 2000, // Consider typing stopped after 2s of no keys (500-5000ms)
  SCROLL_SESSION_TIMEOUT_MS: 500, // Consider scrolling stopped after 500ms (200-2000ms)
  APP_CHANGE_POLL_MS: 500, // Poll active window every 500ms
}

// Capture Throttling Configuration
export const CAPTURE_THROTTLE_CONFIG = {
  MIN_CAPTURE_CHECK_INTERVAL_MS: 2000, // Minimum time between capture checks (ms)
  CLICK_DEBOUNCE_MS: 300, // Debounce rapid clicks (ms)
}

// Context Capture Configuration
export const CONTEXT_CAPTURE_CONFIG = {
  ENABLED: false, // Disabled by default (requires permissions)
}

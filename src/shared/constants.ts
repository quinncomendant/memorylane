// Visual Change Detection Configuration (Event-driven baseline model)
export const VISUAL_DETECTOR_CONFIG = {
  ENABLED: true,
  DHASH_THRESHOLD_PERCENT: 6, // Threshold for baseline comparison (1-20%)
}

// User Interaction Monitoring Configuration
export const INTERACTION_MONITOR_CONFIG = {
  ENABLED: true,
  TRACK_CLICKS: true,
  TRACK_KEYBOARD: true, // Track typing sessions
  TRACK_SCROLL: true, // Track scroll sessions
  TRACK_APP_CHANGE: true, // Track application/window changes
  CLICK_THROTTLE_MS: 1000, // Minimum interval between forwarded click events (500-5000ms)
  TYPING_SESSION_TIMEOUT_MS: 2000, // Consider typing stopped after 2s of no keys (500-5000ms)
  SCROLL_SESSION_TIMEOUT_MS: 2000, // Consider scrolling stopped after 500ms (200-2000ms)
}

// App Watcher Configuration (native Swift subprocess for app/window change detection)
export const APP_WATCHER_CONFIG = {
  MAX_RESTART_RETRIES: 3, // Max automatic restarts after crashes
  RESTART_BACKOFF_MS: 1000, // Base delay between restarts (multiplied by attempt number)
}

// Capture Rate Limiting Configuration
export const CAPTURE_RATE_CONFIG = {
  MIN_CAPTURE_INTERVAL_MS: 5000, // Minimum time between interaction-triggered captures (1000-30000ms)
  MAX_CONCURRENT_PROCESSING: 2, // Max simultaneous screenshot processing tasks (1-4)
}

// Context Capture Configuration
export const CONTEXT_CAPTURE_CONFIG = {
  ENABLED: false, // Disabled by default (requires permissions)
}

// Managed Key / Subscription Configuration
export const MANAGED_KEY_CONFIG = {
  BACKEND_URL:
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:8000/'
      : 'https://api.trymemorylane.com/',
  POLL_INTERVAL_MS: 5_000,
  POLL_TIMEOUT_MS: 600_000, // 10 minutes
}

import { uIOhook, UiohookMouseEvent, UiohookWheelEvent } from 'uiohook-napi'
import activeWin from 'active-win'
import { DEFAULT_INTERACTION_MONITOR_CONFIG } from '@constants'
import { InteractionContext, CaptureSettings } from '../../shared/types'
import { CaptureSettingsManager } from '../settings/capture-settings-manager'
import log from '../logger'

// State
let isRunning = false
let settingsManager: CaptureSettingsManager | null = null

/**
 * Initialize interaction monitor with settings manager
 */
export function initInteractionMonitor(manager: CaptureSettingsManager): void {
  settingsManager = manager

  // Subscribe to settings changes to restart interval if needed
  manager.on('changed', (settings: CaptureSettings) => {
    if (isRunning) {
      // Restart app change polling with new interval if it's running
      if (appChangeIntervalId && DEFAULT_INTERACTION_MONITOR_CONFIG.TRACK_APP_CHANGE) {
        clearInterval(appChangeIntervalId)
        appChangeIntervalId = setInterval(() => {
          checkAppChange().catch(log.error)
        }, DEFAULT_INTERACTION_MONITOR_CONFIG.APP_CHANGE_POLL_MS)
        log.info('[Interaction Monitor] App change polling restarted with updated settings')
      }
    }
    log.info('[Interaction Monitor] Settings changed:', settings)
  })

  log.info('[Interaction Monitor] Initialized with settings manager')
}

/**
 * Get current interaction monitor settings
 */
function getConfig() {
  if (settingsManager) {
    const settings = settingsManager.getSettings()
    return {
      ENABLED: settings.interactionMonitor.enabled,
      TRACK_CLICKS: DEFAULT_INTERACTION_MONITOR_CONFIG.TRACK_CLICKS,
      TRACK_KEYBOARD: DEFAULT_INTERACTION_MONITOR_CONFIG.TRACK_KEYBOARD,
      TRACK_SCROLL: DEFAULT_INTERACTION_MONITOR_CONFIG.TRACK_SCROLL,
      TRACK_APP_CHANGE: DEFAULT_INTERACTION_MONITOR_CONFIG.TRACK_APP_CHANGE,
      TYPING_SESSION_TIMEOUT_MS: settings.interactionMonitor.typingSessionTimeoutMs,
      SCROLL_SESSION_TIMEOUT_MS: settings.interactionMonitor.scrollSessionTimeoutMs,
      APP_CHANGE_POLL_MS: DEFAULT_INTERACTION_MONITOR_CONFIG.APP_CHANGE_POLL_MS,
    }
  }
  return DEFAULT_INTERACTION_MONITOR_CONFIG
}
let typingSessionTimeoutId: NodeJS.Timeout | null = null
let isTyping = false
let typingSessionKeyCount = 0
let typingSessionStartTime = 0

// Scroll state
let scrollSessionTimeoutId: NodeJS.Timeout | null = null
let isScrolling = false
let scrollSessionAmount = 0
let scrollSessionDirection: 'vertical' | 'horizontal' = 'vertical'
let scrollSessionStartTime = 0

// App change state
let appChangeIntervalId: NodeJS.Timeout | null = null
let previousWindow: { title: string; processName: string } | null = null

// Callback for when interaction triggers a capture
type OnInteractionCallback = (context: InteractionContext) => void
const interactionCallbacks: OnInteractionCallback[] = []

/**
 * Handle mouse click events
 * Not debounced because we would loose chronological order of events
 */
function handleMouseClick(event: UiohookMouseEvent): void {
  const config = getConfig()
  if (!config.TRACK_CLICKS) {
    return
  }

  // Schedule notification after delay (to let UI update)
  const context: InteractionContext = {
    type: 'click',
    timestamp: Date.now(),
    clickPosition: {
      x: event.x,
      y: event.y,
    },
  }

  // Notify all callbacks
  interactionCallbacks.forEach((callback) => {
    try {
      callback(context)
    } catch (error) {
      log.error('Error in interaction callback:', error)
    }
  })
}

/**
 * Handle keyboard events (if enabled)
 * Tracks "typing sessions" - emits event when user pauses typing
 */
function handleKeyboard(): void {
  const config = getConfig()
  if (!config.TRACK_KEYBOARD) {
    return
  }

  const now = Date.now()

  // Clear any existing typing session timeout
  if (typingSessionTimeoutId) {
    clearTimeout(typingSessionTimeoutId)
  }

  // Mark that user is typing and track session
  if (!isTyping) {
    isTyping = true
    typingSessionKeyCount = 0
    typingSessionStartTime = now
    log.info('[Interaction Monitor] Typing session started')
  }

  // Increment key count
  typingSessionKeyCount++

  // Get current timeout value (reads live setting)
  const typingTimeout = getConfig().TYPING_SESSION_TIMEOUT_MS

  // Set timeout to detect when typing stops
  typingSessionTimeoutId = setTimeout(() => {
    if (!isTyping) return

    isTyping = false
    const endTime = Date.now() - typingTimeout
    const durationMs = endTime - typingSessionStartTime - typingTimeout

    log.info(
      `[Interaction Monitor] Typing session ended: ${typingSessionKeyCount} keys over ${durationMs}ms`,
    )

    const context: InteractionContext = {
      type: 'keyboard',
      timestamp: endTime,
      keyCount: typingSessionKeyCount,
      durationMs: durationMs,
    }

    // Notify all callbacks
    interactionCallbacks.forEach((callback) => {
      try {
        callback(context)
      } catch (error) {
        log.error('Error in interaction callback:', error)
      }
    })

    // Reset session tracking
    typingSessionKeyCount = 0
    typingSessionStartTime = 0
  }, typingTimeout)
}

/**
 * Handle mouse wheel events (scroll)
 * Tracks "scroll sessions" - emits event when user pauses scrolling
 */
function handleScroll(event: UiohookWheelEvent): void {
  const config = getConfig()
  if (!config.TRACK_SCROLL) {
    return
  }

  const now = Date.now()

  // Clear any existing scroll session timeout
  if (scrollSessionTimeoutId) {
    clearTimeout(scrollSessionTimeoutId)
  }

  // Mark that user is scrolling and track session
  if (!isScrolling) {
    isScrolling = true
    scrollSessionAmount = 0
    scrollSessionStartTime = now
    scrollSessionDirection = event.direction === 3 ? 'vertical' : 'horizontal' // WheelDirection.VERTICAL = 3
    log.info('[Interaction Monitor] Scroll session started')
  }

  // Accumulate scroll amount
  scrollSessionAmount += event.rotation

  // Get current timeout value (reads live setting)
  const scrollTimeout = getConfig().SCROLL_SESSION_TIMEOUT_MS

  // Set timeout to detect when scrolling stops
  scrollSessionTimeoutId = setTimeout(() => {
    if (!isScrolling) return

    isScrolling = false
    const endTime = Date.now() - scrollTimeout
    const durationMs = endTime - scrollSessionStartTime

    log.info(
      `[Interaction Monitor] Scroll session ended: ${scrollSessionAmount} rotation over ${durationMs}ms`,
    )

    const context: InteractionContext = {
      type: 'scroll',
      timestamp: endTime,
      scrollDirection: scrollSessionDirection,
      scrollAmount: scrollSessionAmount,
    }

    // Notify all callbacks
    interactionCallbacks.forEach((callback) => {
      try {
        callback(context)
      } catch (error) {
        log.error('Error in interaction callback:', error)
      }
    })

    // Reset session tracking
    scrollSessionAmount = 0
    scrollSessionStartTime = 0
  }, scrollTimeout)
}

/**
 * Check for app/window changes
 * Called periodically by interval timer
 */
async function checkAppChange(): Promise<void> {
  const config = getConfig()
  if (!config.TRACK_APP_CHANGE) {
    return
  }

  try {
    const currentWindow = await activeWin()

    if (!currentWindow) {
      return
    }

    const current = {
      title: currentWindow.title,
      processName: currentWindow.owner.name,
    }

    // Check if window has changed
    if (
      previousWindow &&
      (previousWindow.title !== current.title || previousWindow.processName !== current.processName)
    ) {
      log.info(
        `[Interaction Monitor] App changed from ${previousWindow.processName} to ${current.processName}`,
      )

      const context: InteractionContext = {
        type: 'app_change',
        timestamp: Date.now(),
        activeWindow: current,
        previousWindow: previousWindow,
      }

      // Notify all callbacks
      interactionCallbacks.forEach((callback) => {
        try {
          callback(context)
        } catch (error) {
          log.error('Error in interaction callback:', error)
        }
      })
    }

    // Update previous window
    previousWindow = current
  } catch (error) {
    log.error('[Interaction Monitor] Error checking active window:', error)
  }
}

/**
 * Start monitoring user interactions
 */
export function startInteractionMonitoring(): void {
  if (isRunning) {
    log.info('[Interaction Monitor] Already running')
    return
  }

  const config = getConfig()
  if (!config.ENABLED) {
    log.info('[Interaction Monitor] Disabled in config')
    return
  }

  try {
    log.info('[Interaction Monitor] Starting')
    isRunning = true

    // Register event handlers
    if (config.TRACK_CLICKS) {
      uIOhook.on('click', handleMouseClick)
    }

    if (config.TRACK_KEYBOARD) {
      uIOhook.on('keydown', handleKeyboard)
    }

    if (config.TRACK_SCROLL) {
      uIOhook.on('wheel', handleScroll)
    }

    // Start the hook
    uIOhook.start()
    log.info('[Interaction Monitor] uiohook started successfully')

    // Start app change polling
    if (config.TRACK_APP_CHANGE) {
      // Initialize current window
      checkAppChange().catch(log.error)

      appChangeIntervalId = setInterval(() => {
        checkAppChange().catch(log.error)
      }, config.APP_CHANGE_POLL_MS)
      log.info('[Interaction Monitor] App change polling started')
    }
  } catch (error) {
    log.error('[Interaction Monitor] Failed to start:', error)
    isRunning = false
    throw error
  }
}

/**
 * Stop monitoring user interactions
 */
export function stopInteractionMonitoring(): void {
  if (!isRunning) {
    log.info('[Interaction Monitor] Not running')
    return
  }

  try {
    log.info('[Interaction Monitor] Stopping')
    isRunning = false
    isTyping = false
    typingSessionKeyCount = 0
    typingSessionStartTime = 0
    isScrolling = false
    scrollSessionAmount = 0
    scrollSessionStartTime = 0
    previousWindow = null

    // Clear any pending typing session timeout
    if (typingSessionTimeoutId) {
      clearTimeout(typingSessionTimeoutId)
      typingSessionTimeoutId = null
    }

    // Clear any pending scroll session timeout
    if (scrollSessionTimeoutId) {
      clearTimeout(scrollSessionTimeoutId)
      scrollSessionTimeoutId = null
    }

    // Clear app change polling interval
    if (appChangeIntervalId) {
      clearInterval(appChangeIntervalId)
      appChangeIntervalId = null
    }

    // Stop the hook
    uIOhook.stop()

    // Remove event listeners
    uIOhook.removeAllListeners()
  } catch (error) {
    log.error('[Interaction Monitor] Failed to stop:', error)
  }
}

/**
 * Register a callback to be notified when interactions trigger captures
 */
export function onInteraction(callback: OnInteractionCallback): void {
  interactionCallbacks.push(callback)
}

/**
 * Check if interaction monitoring is currently running
 */
export function isMonitoring(): boolean {
  return isRunning
}

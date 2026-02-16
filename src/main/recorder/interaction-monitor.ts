import { screen } from 'electron'
import { uIOhook, UiohookMouseEvent, UiohookWheelEvent } from 'uiohook-napi'
import { INTERACTION_MONITOR_CONFIG } from '@constants'
import { InteractionContext } from '../../shared/types'
import { startAppWatcher, stopAppWatcher, AppWatcherEvent } from './app-watcher'
import log from '../logger'

// State
let isRunning = false
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

// Click throttle state
let lastClickTime = 0

// App change state
let previousWindow: NonNullable<InteractionContext['activeWindow']> | null = null

// Display resolution state (used by keyboard/scroll handlers)
let cachedDisplayId: number | null = null

/**
 * Resolve which Electron Display contains the given global coordinate.
 */
function getDisplayIdForPoint(x: number, y: number): number {
  return screen.getDisplayNearestPoint({ x, y }).id
}

// Callback for when interaction triggers a capture
type OnInteractionCallback = (context: InteractionContext) => void
const interactionCallbacks: OnInteractionCallback[] = []

/**
 * Handle mouse click events
 * Throttled to prevent rapid-fire captures from fast clicking
 */
function handleMouseClick(event: UiohookMouseEvent): void {
  if (!INTERACTION_MONITOR_CONFIG.TRACK_CLICKS) {
    return
  }

  const now = Date.now()
  if (now - lastClickTime < INTERACTION_MONITOR_CONFIG.CLICK_THROTTLE_MS) {
    return
  }
  lastClickTime = now

  const displayId = getDisplayIdForPoint(event.x, event.y)

  const context: InteractionContext = {
    type: 'click',
    timestamp: now,
    displayId,
    clickPosition: {
      x: event.x,
      y: event.y,
    },
  }

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
  if (!INTERACTION_MONITOR_CONFIG.TRACK_KEYBOARD) {
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

  // Set timeout to detect when typing stops
  typingSessionTimeoutId = setTimeout(() => {
    if (!isTyping) return

    isTyping = false
    const endTime = Date.now() - INTERACTION_MONITOR_CONFIG.TYPING_SESSION_TIMEOUT_MS
    const durationMs =
      endTime - typingSessionStartTime - INTERACTION_MONITOR_CONFIG.TYPING_SESSION_TIMEOUT_MS

    log.info(
      `[Interaction Monitor] Typing session ended: ${typingSessionKeyCount} keys over ${durationMs}ms`,
    )

    const context: InteractionContext = {
      type: 'keyboard',
      timestamp: endTime,
      displayId: cachedDisplayId ?? undefined,
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
  }, INTERACTION_MONITOR_CONFIG.TYPING_SESSION_TIMEOUT_MS)
}

/**
 * Handle mouse wheel events (scroll)
 * Tracks "scroll sessions" - emits event when user pauses scrolling
 */
function handleScroll(event: UiohookWheelEvent): void {
  if (!INTERACTION_MONITOR_CONFIG.TRACK_SCROLL) {
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

  // Set timeout to detect when scrolling stops
  scrollSessionTimeoutId = setTimeout(() => {
    if (!isScrolling) return

    isScrolling = false
    const endTime = Date.now() - INTERACTION_MONITOR_CONFIG.SCROLL_SESSION_TIMEOUT_MS
    const durationMs = endTime - scrollSessionStartTime

    log.info(
      `[Interaction Monitor] Scroll session ended: ${scrollSessionAmount} rotation over ${durationMs}ms`,
    )

    const context: InteractionContext = {
      type: 'scroll',
      timestamp: endTime,
      displayId: cachedDisplayId ?? undefined,
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
  }, INTERACTION_MONITOR_CONFIG.SCROLL_SESSION_TIMEOUT_MS)
}

/**
 * Handle events from the native app-watcher process.
 * Translates AppWatcherEvent into InteractionContext for downstream consumers.
 */
function handleAppWatcherEvent(event: AppWatcherEvent): void {
  log.debug(
    `[Interaction Monitor] Received AppWatcher event: type=${event.type} app=${event.app} title=${event.title}`,
  )

  if (event.type === 'ready') {
    log.info('[Interaction Monitor] AppWatcher is ready and streaming events')
    return
  }
  if (event.type === 'error') {
    log.warn(`[Interaction Monitor] AppWatcher error: ${event.error}`)
    return
  }

  // Both app_change and window_change map to the same InteractionContext type
  const current: NonNullable<InteractionContext['activeWindow']> = {
    title: event.title ?? '',
    processName: event.app ?? '',
    ...(event.url && { url: event.url }),
  }

  // Skip if nothing actually changed
  if (
    previousWindow &&
    previousWindow.title === current.title &&
    previousWindow.processName === current.processName
  ) {
    log.debug(`[Interaction Monitor] Skipping duplicate: ${current.processName} "${current.title}"`)
    return
  }

  // Update display cache from the mouse cursor position (best approximation
  // without window bounds, which the watcher doesn't provide)
  const cursorPoint = screen.getCursorScreenPoint()
  cachedDisplayId = getDisplayIdForPoint(cursorPoint.x, cursorPoint.y)

  log.info(
    `[Interaction Monitor] App changed from ${previousWindow?.processName ?? '(none)'} to ${current.processName}`,
  )

  const context: InteractionContext = {
    type: 'app_change',
    timestamp: event.timestamp,
    displayId: cachedDisplayId,
    activeWindow: current,
    previousWindow: previousWindow ?? undefined,
  }

  const prev = previousWindow
  previousWindow = current

  // Don't emit on the very first event (no previous to compare against)
  if (!prev) return

  // Notify all callbacks
  log.debug(
    `[Interaction Monitor] Dispatching app_change to ${interactionCallbacks.length} callback(s)`,
  )
  interactionCallbacks.forEach((callback) => {
    try {
      callback(context)
    } catch (error) {
      log.error('Error in interaction callback:', error)
    }
  })
}

/**
 * Start monitoring user interactions
 */
export function startInteractionMonitoring(): void {
  if (isRunning) {
    log.info('[Interaction Monitor] Already running')
    return
  }

  if (!INTERACTION_MONITOR_CONFIG.ENABLED) {
    log.info('[Interaction Monitor] Disabled in config')
    return
  }

  try {
    log.info('[Interaction Monitor] Starting')
    isRunning = true

    // Register event handlers
    if (INTERACTION_MONITOR_CONFIG.TRACK_CLICKS) {
      uIOhook.on('click', handleMouseClick)
    }

    if (INTERACTION_MONITOR_CONFIG.TRACK_KEYBOARD) {
      uIOhook.on('keydown', handleKeyboard)
    }

    if (INTERACTION_MONITOR_CONFIG.TRACK_SCROLL) {
      uIOhook.on('wheel', handleScroll)
    }

    // Start the hook
    uIOhook.start()
    log.info('[Interaction Monitor] uiohook started successfully')

    // Start native app-watcher process for app/window change events
    if (INTERACTION_MONITOR_CONFIG.TRACK_APP_CHANGE) {
      startAppWatcher(handleAppWatcherEvent)
      log.info('[Interaction Monitor] App watcher started')
    }
  } catch (error) {
    log.error('[Interaction Monitor] Failed to start:', error)
    isRunning = false
    throw error
  }
}

/**
 * Stop monitoring user interactions
 * This will clear all registered callbacks - they will need to be re-registered if you want to start monitoring again
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
    lastClickTime = 0
    previousWindow = null
    cachedDisplayId = null

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

    // Stop the native app-watcher process
    stopAppWatcher()

    // Stop the hook
    uIOhook.stop()

    // Remove event listeners
    uIOhook.removeAllListeners()
  } catch (error) {
    log.error('[Interaction Monitor] Failed to stop:', error)
  }
}

/**
 * Register a callback to be notified when interactions trigger captures.
 */
export function onInteraction(callback: OnInteractionCallback): void {
  interactionCallbacks.push(callback)
  log.info(`[Interaction Monitor] Callback registered (total: ${interactionCallbacks.length})`)
}

/**
 * Clear a specific callback from the registered callbacks.
 */
export function clearInteractionCallback(callback: OnInteractionCallback): void {
  if (!interactionCallbacks.includes(callback)) {
    log.warn(
      `[Interaction Monitor] Callback not found for removal (total: ${interactionCallbacks.length})`,
    )
    return
  }
  interactionCallbacks.splice(interactionCallbacks.indexOf(callback), 1)
  log.info(`[Interaction Monitor] Callback removed (total: ${interactionCallbacks.length})`)
}

/**
 * Check if interaction monitoring is currently running
 */
export function isMonitoring(): boolean {
  return isRunning
}

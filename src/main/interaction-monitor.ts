import { uIOhook, UiohookMouseEvent, UiohookKeyboardEvent } from 'uiohook-napi';
import { INTERACTION_MONITOR_CONFIG } from '../shared/constants';
import { InteractionContext } from '../shared/types';

// State
let isRunning = false;
let lastInteractionTime = 0;
let debounceTimeoutId: NodeJS.Timeout | null = null;
let typingSessionTimeoutId: NodeJS.Timeout | null = null;
let isTyping = false;
let typingSessionKeyCount = 0;
let typingSessionStartTime = 0;

// Callback for when interaction triggers a capture
type OnInteractionCallback = (context: InteractionContext) => void;
const interactionCallbacks: OnInteractionCallback[] = [];

/**
 * Handle mouse click events
 */
function handleMouseClick(event: UiohookMouseEvent): void {
  if (!INTERACTION_MONITOR_CONFIG.TRACK_CLICKS) {
    return;
  }

  const now = Date.now();

  // Check if we're within debounce period
  if (now - lastInteractionTime < INTERACTION_MONITOR_CONFIG.DEBOUNCE_MS) {
    console.log('Interaction debounced - too soon after last interaction');
    return;
  }

  console.log('Mouse click detected:', { x: event.x, y: event.y, button: event.button });

  // Clear any existing debounce timeout
  if (debounceTimeoutId) {
    clearTimeout(debounceTimeoutId);
  }

  // Schedule capture after delay (to let UI update)
  debounceTimeoutId = setTimeout(() => {
    lastInteractionTime = Date.now();

    const context: InteractionContext = {
      type: 'click',
      timestamp: lastInteractionTime,
      clickPosition: {
        x: event.x,
        y: event.y,
      },
    };

    // Notify all callbacks
    interactionCallbacks.forEach((callback) => {
      try {
        callback(context);
      } catch (error) {
        console.error('Error in interaction callback:', error);
      }
    });
  }, INTERACTION_MONITOR_CONFIG.CAPTURE_DELAY_MS);
}

/**
 * Handle keyboard events (if enabled)
 * Tracks "typing sessions" - emits event when user pauses typing
 */
function handleKeyboard(event: UiohookKeyboardEvent): void {
  if (!INTERACTION_MONITOR_CONFIG.TRACK_KEYBOARD) {
    return;
  }

  const now = Date.now();

  // Check if we're within debounce period from last interaction event
  if (now - lastInteractionTime < INTERACTION_MONITOR_CONFIG.DEBOUNCE_MS) {
    return;
  }

  // Clear any existing typing session timeout
  if (typingSessionTimeoutId) {
    clearTimeout(typingSessionTimeoutId);
  }

  // Mark that user is typing and track session
  if (!isTyping) {
    isTyping = true;
    typingSessionKeyCount = 0;
    typingSessionStartTime = now;
    console.log('Typing session started');
  }

  // Increment key count
  typingSessionKeyCount++;

  // Set timeout to detect when typing stops
  typingSessionTimeoutId = setTimeout(() => {
    if (!isTyping) return;

    isTyping = false;
    const endTime = Date.now();
    const durationMs = endTime - typingSessionStartTime;
    lastInteractionTime = endTime;

    console.log(`Typing session ended: ${typingSessionKeyCount} keys over ${durationMs}ms`);

    const context: InteractionContext = {
      type: 'keyboard',
      timestamp: endTime,
      keyCount: typingSessionKeyCount,
      durationMs: durationMs,
    };

    // Notify all callbacks
    interactionCallbacks.forEach((callback) => {
      try {
        callback(context);
      } catch (error) {
        console.error('Error in interaction callback:', error);
      }
    });

    // Reset session tracking
    typingSessionKeyCount = 0;
    typingSessionStartTime = 0;
  }, INTERACTION_MONITOR_CONFIG.TYPING_SESSION_TIMEOUT_MS);
}

/**
 * Start monitoring user interactions
 */
export function startInteractionMonitoring(): void {
  if (isRunning) {
    console.log('Interaction monitoring already running');
    return;
  }

  if (!INTERACTION_MONITOR_CONFIG.ENABLED) {
    console.log('Interaction monitoring is disabled');
    return;
  }

  try {
    console.log('Starting interaction monitoring');
    isRunning = true;

    // Register event handlers
    if (INTERACTION_MONITOR_CONFIG.TRACK_CLICKS) {
      uIOhook.on('click', handleMouseClick);
    }

    if (INTERACTION_MONITOR_CONFIG.TRACK_KEYBOARD) {
      uIOhook.on('keydown', handleKeyboard);
      console.log('Keyboard event handler registered');
    }

    // Start the hook
    uIOhook.start();
    console.log('uiohook started successfully');
  } catch (error) {
    console.error('Failed to start interaction monitoring:', error);
    isRunning = false;
    throw error;
  }
}

/**
 * Stop monitoring user interactions
 */
export function stopInteractionMonitoring(): void {
  if (!isRunning) {
    console.log('Interaction monitoring not running');
    return;
  }

  try {
    console.log('Stopping interaction monitoring');
    isRunning = false;
    isTyping = false;
    typingSessionKeyCount = 0;
    typingSessionStartTime = 0;

    // Clear any pending debounce
    if (debounceTimeoutId) {
      clearTimeout(debounceTimeoutId);
      debounceTimeoutId = null;
    }

    // Clear any pending typing session timeout
    if (typingSessionTimeoutId) {
      clearTimeout(typingSessionTimeoutId);
      typingSessionTimeoutId = null;
    }

    // Stop the hook
    uIOhook.stop();

    // Remove event listeners
    uIOhook.removeAllListeners();
  } catch (error) {
    console.error('Failed to stop interaction monitoring:', error);
  }
}

/**
 * Register a callback to be notified when interactions trigger captures
 */
export function onInteraction(callback: OnInteractionCallback): void {
  interactionCallbacks.push(callback);
}

/**
 * Check if interaction monitoring is currently running
 */
export function isMonitoring(): boolean {
  return isRunning;
}

import { app, desktopCapturer } from 'electron'
// eslint-disable-next-line import/no-unresolved
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import { Screenshot, OnScreenshotCallback, CaptureReason } from '../../shared/types'
import * as visualDetector from './visual-detector'
import * as interactionMonitor from './interaction-monitor'
import log from '../logger'

// Configuration
const SCREENSHOTS_DIR = path.join(app.getPath('userData'), 'screenshots')
const SCREENSHOT_MAX_AGE_MS = 60_000
const CLEANUP_INTERVAL_MS = 30_000

// State
const screenshotCallbacks: OnScreenshotCallback[] = []
let isCapturing = false
let cleanupTimer: ReturnType<typeof setInterval> | null = null

// Ensure screenshots directory exists
function ensureScreenshotsDir(): void {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  }
}

/**
 * Delete screenshot files older than SCREENSHOT_MAX_AGE_MS from the screenshots directory.
 */
function cleanupOldScreenshots(): void {
  try {
    const now = Date.now()
    const files = fs.readdirSync(SCREENSHOTS_DIR)

    for (const file of files) {
      if (!file.endsWith('.png')) continue

      const filepath = path.join(SCREENSHOTS_DIR, file)
      const stat = fs.statSync(filepath)

      if (now - stat.mtimeMs > SCREENSHOT_MAX_AGE_MS) {
        fs.unlinkSync(filepath)
        log.info(`[Cleanup] Deleted old screenshot: ${file}`)
      }
    }
  } catch (error) {
    log.error('[Cleanup] Error cleaning up old screenshots:', error)
  }
}

/**
 * Capture a screenshot from the primary display
 */
export async function captureNow(reason?: CaptureReason): Promise<Screenshot> {
  ensureScreenshotsDir()

  // Default reason if not provided
  const captureReason: CaptureReason = reason || {
    type: 'manual',
  }

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: 1920 * 2, // Support high DPI displays
      height: 1080 * 2,
    },
  })

  if (sources.length === 0) {
    throw new Error('No screen sources available for capture')
  }

  // Use the primary display (first source)
  const primarySource = sources[0]
  const thumbnail = primarySource.thumbnail

  // Generate screenshot metadata
  const id = uuidv4()
  const timestamp = Date.now()
  const filename = `${timestamp}_${id}.png`
  const filepath = path.join(SCREENSHOTS_DIR, filename)

  // Get actual thumbnail dimensions
  const size = thumbnail.getSize()

  // Save the screenshot
  const pngBuffer = thumbnail.toPNG()
  fs.writeFileSync(filepath, pngBuffer)

  const screenshot: Screenshot = {
    id,
    filepath,
    timestamp,
    display: {
      id: parseInt(primarySource.id.split(':')[1] || '0', 10),
      width: size.width,
      height: size.height,
    },
    trigger: captureReason,
  }

  log.info(`[Capture] Screenshot saved: ${filename} (reason: ${captureReason.type})`)

  // Notify all registered callbacks
  screenshotCallbacks.forEach((callback) => {
    try {
      callback(screenshot)
    } catch (error) {
      log.error('Error in screenshot callback:', error)
    }
  })

  return screenshot
}

/**
 * Start capturing screenshots using event-driven baseline detection
 */
export function startCapture(): void {
  if (isCapturing) {
    log.info('[Capture] Already running')
    return
  }

  log.info('[Capture] Starting screenshot capture with event-driven baseline detection')
  isCapturing = true

  // Start periodic cleanup of old screenshot files
  cleanupTimer = setInterval(cleanupOldScreenshots, CLEANUP_INTERVAL_MS)

  // Start visual detection (no interval, just enables the module)
  visualDetector.startVisualDetection()

  // Start interaction monitoring
  interactionMonitor.startInteractionMonitoring()

  // Capture initial baseline screenshot and set it as baseline
  captureNow({ type: 'manual' })
    .then(async () => {
      log.info('[Capture] Initial baseline screenshot captured')
      await visualDetector.updateBaseline()
      log.info('[Capture] Baseline set')
    })
    .catch((error) => {
      log.error('[Capture] Failed to capture initial baseline:', error)
    })

  // Register interaction monitor callback
  interactionMonitor.onInteraction(async (context) => {
    log.info(`[Capture] Interaction detected: ${context.type}`)

    // Check visual change against baseline
    const result = await visualDetector.checkAgainstBaseline()

    if (result.changed) {
      log.info(
        `[Capture] Visual change detected (${result.difference.toFixed(1)}%) - capturing new screenshot`,
      )

      // Capture new screenshot
      await captureNow({
        type: 'baseline_change',
        confidence: result.difference,
      })

      // Update baseline to new screenshot
      await visualDetector.updateBaseline()
      log.info('[Capture] Baseline updated to new screenshot')
    } else {
      log.info(
        `[Capture] No significant change (${result.difference.toFixed(1)}%) - keeping current baseline`,
      )
    }
  })
}

/**
 * Stop capturing screenshots
 */
export function stopCapture(): void {
  if (!isCapturing) {
    log.info('[Capture] Not running')
    return
  }

  log.info('[Capture] Stopping screenshot capture')
  isCapturing = false

  // Stop periodic cleanup
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }

  // Stop visual detection
  visualDetector.stopVisualDetection()

  // Stop interaction monitoring
  interactionMonitor.stopInteractionMonitoring()
}

/**
 * Register a callback to be notified when screenshots are captured
 */
export function onScreenshot(callback: OnScreenshotCallback): void {
  screenshotCallbacks.push(callback)
}

/**
 * Get the directory where screenshots are saved
 */
export function getScreenshotsDir(): string {
  return SCREENSHOTS_DIR
}

/**
 * Check if capture is currently running
 */
export function isCapturingNow(): boolean {
  return isCapturing
}

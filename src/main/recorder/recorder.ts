import { app, desktopCapturer, NativeImage } from 'electron'
// eslint-disable-next-line import/no-unresolved
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import { Screenshot, OnScreenshotCallback, CaptureReason } from '../../shared/types'
import { CAPTURE_THROTTLE_CONFIG } from '@constants'
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
let lastCaptureCheckTime = 0

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

interface CaptureResult {
  screenshot: Screenshot
  thumbnail: NativeImage
}

/**
 * Capture a screenshot from the primary display.
 * Returns both the saved Screenshot metadata and the raw NativeImage thumbnail
 * so callers can reuse it (e.g. to update the visual baseline without an extra capture).
 */
async function captureInternal(reason: CaptureReason): Promise<CaptureResult> {
  ensureScreenshotsDir()

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: 1920 * 2,
      height: 1080 * 2,
    },
  })

  const primarySource = sources[0]
  if (primarySource === undefined) {
    throw new Error('No screen sources available for capture')
  }

  const thumbnail = primarySource.thumbnail

  const id = uuidv4()
  const timestamp = Date.now()
  const filename = `${timestamp}_${id}.png`
  const filepath = path.join(SCREENSHOTS_DIR, filename)

  const size = thumbnail.getSize()

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
    trigger: reason,
  }

  log.info(`[Capture] Screenshot saved: ${filename} (reason: ${reason.type})`)

  screenshotCallbacks.forEach((callback) => {
    try {
      callback(screenshot)
    } catch (error) {
      log.error('Error in screenshot callback:', error)
    }
  })

  return { screenshot, thumbnail }
}

/**
 * Capture a screenshot from the primary display (public API).
 */
export async function captureNow(reason?: CaptureReason): Promise<Screenshot> {
  const captureReason: CaptureReason = reason || { type: 'manual' }
  const { screenshot } = await captureInternal(captureReason)
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
  lastCaptureCheckTime = 0

  cleanupTimer = setInterval(cleanupOldScreenshots, CLEANUP_INTERVAL_MS)

  visualDetector.startVisualDetection()

  interactionMonitor.startInteractionMonitoring()

  captureInternal({ type: 'manual' })
    .then(async ({ thumbnail }) => {
      log.info('[Capture] Initial baseline screenshot captured')
      await visualDetector.updateBaseline(thumbnail)
      log.info('[Capture] Baseline set')
    })
    .catch((error) => {
      log.error('[Capture] Failed to capture initial baseline:', error)
    })

  interactionMonitor.onInteraction(async (context) => {
    const now = Date.now()
    if (now - lastCaptureCheckTime < CAPTURE_THROTTLE_CONFIG.MIN_CAPTURE_CHECK_INTERVAL_MS) {
      log.info(`[Capture] Throttled interaction (${now - lastCaptureCheckTime}ms since last check)`)
      return
    }
    lastCaptureCheckTime = now

    log.info(`[Capture] Interaction detected: ${context.type}`)

    const result = await visualDetector.checkAgainstBaseline()

    if (result.changed) {
      log.info(
        `[Capture] Visual change detected (${result.difference.toFixed(1)}%) - capturing new screenshot`,
      )

      const { thumbnail } = await captureInternal({
        type: 'baseline_change',
        confidence: result.difference,
      })

      await visualDetector.updateBaseline(thumbnail)
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

  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }

  visualDetector.stopVisualDetection()

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

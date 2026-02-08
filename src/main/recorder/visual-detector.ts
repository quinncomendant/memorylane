import { desktopCapturer } from 'electron'
import { DEFAULT_VISUAL_DETECTOR_CONFIG } from '@constants'
import { CaptureSettingsManager } from '../settings/capture-settings-manager'
import log from '../logger'

// State
let baselineHash: string | null = null
let isRunning = false
let settingsManager: CaptureSettingsManager | null = null

/**
 * Initialize visual detector with settings manager
 */
export function initVisualDetector(manager: CaptureSettingsManager): void {
  settingsManager = manager
  log.info('[Visual Detector] Initialized with settings manager')
}

/**
 * Get current visual detector settings
 */
function getConfig() {
  if (settingsManager) {
    const settings = settingsManager.getSettings()
    return {
      ENABLED: settings.visualDetector.enabled,
      DHASH_THRESHOLD_PERCENT: settings.visualDetector.dhashThresholdPercent,
      SAMPLE_WIDTH: DEFAULT_VISUAL_DETECTOR_CONFIG.SAMPLE_WIDTH,
      SAMPLE_HEIGHT: DEFAULT_VISUAL_DETECTOR_CONFIG.SAMPLE_HEIGHT,
    }
  }
  return DEFAULT_VISUAL_DETECTOR_CONFIG
}

/**
 * Calculate difference hash (dHash) for perceptual comparison
 * Fast and resilient to minor changes like cursor movement
 */
function calculateDHash(buffer: Buffer, width: number, height: number): string {
  const grayscale: number[] = []

  // Convert to grayscale
  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i]
    const g = buffer[i + 1]
    const b = buffer[i + 2]
    const gray = Math.floor(0.299 * r + 0.587 * g + 0.114 * b)
    grayscale.push(gray)
  }

  // Build hash by comparing adjacent pixels
  let hash = ''
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const idx = y * width + x
      hash += grayscale[idx] < grayscale[idx + 1] ? '1' : '0'
    }
  }

  return hash
}

/**
 * Calculate Hamming distance between two hashes
 * Returns percentage difference (0-100)
 */
function hammingDistance(hash1: string | null, hash2: string | null): number {
  if (hash1 == null || hash2 == null || hash1.length !== hash2.length) return 100

  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++
  }

  return (distance / hash1.length) * 100
}

/**
 * Capture a lightweight sample of the screen for comparison
 */
async function captureSample(): Promise<Buffer> {
  const config = getConfig()
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: config.SAMPLE_WIDTH,
      height: config.SAMPLE_HEIGHT,
    },
  })

  if (sources.length === 0) {
    throw new Error('No screen sources available for sampling')
  }

  const primarySource = sources[0]
  const thumbnail = primarySource.thumbnail

  // Get raw bitmap data for comparison
  return thumbnail.toBitmap()
}

/**
 * Check current screen against baseline
 * Returns whether a significant change was detected and the difference percentage
 */
export async function checkAgainstBaseline(): Promise<{ changed: boolean; difference: number }> {
  if (!isRunning) {
    log.info('[Visual Detector] Cannot check - not running')
    return { changed: false, difference: 0 }
  }

  if (baselineHash === null) {
    log.info('[Visual Detector] No baseline set - updating baseline')
    await updateBaseline()
    return { changed: false, difference: 0 }
  }

  try {
    const config = getConfig()
    const currentImageData = await captureSample()
    const currentHash = calculateDHash(currentImageData, config.SAMPLE_WIDTH, config.SAMPLE_HEIGHT)

    const difference = hammingDistance(baselineHash, currentHash)

    log.info(`[Visual Detector] Baseline comparison: ${difference.toFixed(1)}%`)

    const changed = difference >= config.DHASH_THRESHOLD_PERCENT

    if (changed) {
      log.info(
        `[Visual Detector] Significant change detected (>=${config.DHASH_THRESHOLD_PERCENT}%)`,
      )
    }

    return { changed, difference }
  } catch (error) {
    log.error('Error checking against baseline:', error)
    return { changed: false, difference: 0 }
  }
}

/**
 * Update the baseline to the current screen state
 * Call this after capturing a screenshot or on startup
 */
export async function updateBaseline(): Promise<void> {
  if (!isRunning) {
    log.info('[Visual Detector] Cannot update baseline - not running')
    return
  }

  try {
    const config = getConfig()
    const currentImageData = await captureSample()
    baselineHash = calculateDHash(currentImageData, config.SAMPLE_WIDTH, config.SAMPLE_HEIGHT)
    log.info('[Visual Detector] Baseline updated')
  } catch (error) {
    log.error('Error updating baseline:', error)
  }
}

/**
 * Start visual detection (event-driven mode)
 */
export function startVisualDetection(): void {
  if (isRunning) {
    log.info('[Visual Detector] Already running')
    return
  }

  const config = getConfig()
  if (!config.ENABLED) {
    log.info('[Visual Detector] Disabled in config')
    return
  }

  log.info(`[Visual Detector] Starting (threshold: ${config.DHASH_THRESHOLD_PERCENT}%)`)
  isRunning = true
  baselineHash = null
}

/**
 * Stop visual detection
 */
export function stopVisualDetection(): void {
  if (!isRunning) {
    log.info('[Visual Detector] Not running')
    return
  }

  log.info('[Visual Detector] Stopping')
  isRunning = false
  baselineHash = null
}

/**
 * Check if visual detection is currently running
 */
export function isDetecting(): boolean {
  return isRunning
}

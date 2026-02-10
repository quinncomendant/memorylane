import { VISUAL_DETECTOR_CONFIG } from '@constants'
import log from '../logger'

// State
let baselineHash: string | null = null
let isRunning = false

function bufferToGrayscale(buffer: Buffer): number[] {
  const grayscale: number[] = []
  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i]
    const g = buffer[i + 1]
    const b = buffer[i + 2]
    const gray = Math.floor(0.299 * r + 0.587 * g + 0.114 * b)
    grayscale.push(gray)
  }
  return grayscale
}

/**
 * Calculate difference hash (dHash) for perceptual comparison
 * Fast and resilient to minor changes like cursor movement
 */
function calculateDHash(buffer: Buffer): string {
  const grayscale = bufferToGrayscale(buffer)

  // Build hash by comparing adjacent pixels
  let hash = ''
  for (let i = 0; i < grayscale.length - 1; i++) {
    hash += grayscale[i] < grayscale[i + 1] ? '1' : '0'
  }
  return hash
}

/**
 * Calculate Hamming distance between two hashes
 * Returns percentage difference (0-100)
 */
function hammingDistance(hash1: string | null, hash2: string | null): number {
  if (hash1 == null || hash2 == null) return 100

  if (hash1.length !== hash2.length) {
    log.error('Hashes must be the same length', { hash1: hash1.length, hash2: hash2.length })
    throw new Error('Hashes must be the same length')
  }

  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++
  }

  return (distance / hash1.length) * 100
}

/**
 * Check a pre-captured bitmap against the baseline (no desktopCapturer call).
 * The bitmap must match the configured sample dimensions (RGBA pixel data).
 */
export function checkBitmapAgainstBaseline(
  bitmap: Buffer,
  useMostRecentAsBaseline: boolean = true,
): {
  changed: boolean
  difference: number
} {
  if (!isRunning) {
    return { changed: false, difference: 0 }
  }

  if (baselineHash === null) {
    baselineHash = calculateDHash(bitmap)
    log.info('[Visual Detector] No baseline set - initialized from provided bitmap')
    return { changed: false, difference: 0 }
  }

  const currentHash = calculateDHash(bitmap)

  if (baselineHash.length !== currentHash.length) {
    log.debug(
      `[Visual Detector] Hash length mismatch (${baselineHash.length} vs ${currentHash.length})` +
        ' - different screen dimensions, treating as changed',
    )
    if (useMostRecentAsBaseline) {
      baselineHash = currentHash
    }
    return { changed: true, difference: 100 }
  }

  const difference = hammingDistance(baselineHash, currentHash)

  log.info(`[Visual Detector] Baseline comparison: ${difference.toFixed(1)}%`)

  const changed = difference >= VISUAL_DETECTOR_CONFIG.DHASH_THRESHOLD_PERCENT

  if (changed) {
    log.info(
      `[Visual Detector] Significant change detected (>=${VISUAL_DETECTOR_CONFIG.DHASH_THRESHOLD_PERCENT}%)`,
    )
  }

  if (useMostRecentAsBaseline) {
    baselineHash = currentHash
  }

  return { changed, difference }
}

/**
 * Update the baseline from a pre-captured bitmap.
 */
export function updateBaselineFromBitmap(bitmap: Buffer): void {
  if (!isRunning) {
    return
  }

  baselineHash = calculateDHash(bitmap)
  log.info('[Visual Detector] Baseline updated from provided bitmap')
}

/**
 * Start visual detection (event-driven mode)
 */
export function startVisualDetection(): void {
  if (isRunning) {
    log.info('[Visual Detector] Already running')
    return
  }

  if (!VISUAL_DETECTOR_CONFIG.ENABLED) {
    log.info('[Visual Detector] Disabled in config')
    return
  }

  log.info(
    `[Visual Detector] Starting (threshold: ${VISUAL_DETECTOR_CONFIG.DHASH_THRESHOLD_PERCENT}%)`,
  )
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

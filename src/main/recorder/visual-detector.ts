import { desktopCapturer } from 'electron';
import { VISUAL_DETECTOR_CONFIG } from '../../shared/constants';

// State
let baselineHash: string | null = null;
let isRunning = false;

/**
 * Calculate difference hash (dHash) for perceptual comparison
 * Fast and resilient to minor changes like cursor movement
 */
function calculateDHash(buffer: Buffer, width: number, height: number): string {
  const grayscale: number[] = [];

  // Convert to grayscale
  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    const gray = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
    grayscale.push(gray);
  }

  // Build hash by comparing adjacent pixels
  let hash = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const idx = y * width + x;
      hash += grayscale[idx] < grayscale[idx + 1] ? '1' : '0';
    }
  }

  return hash;
}

/**
 * Calculate Hamming distance between two hashes
 * Returns percentage difference (0-100)
 */
function hammingDistance(hash1: string | null, hash2: string | null): number {
  if (hash1 == null || hash2 == null || hash1.length !== hash2.length) return 100;

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }

  return (distance / hash1.length) * 100;
}

/**
 * Capture a lightweight sample of the screen for comparison
 */
async function captureSample(): Promise<Buffer> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: VISUAL_DETECTOR_CONFIG.SAMPLE_WIDTH,
      height: VISUAL_DETECTOR_CONFIG.SAMPLE_HEIGHT,
    },
  });

  if (sources.length === 0) {
    throw new Error('No screen sources available for sampling');
  }

  const primarySource = sources[0];
  const thumbnail = primarySource.thumbnail;

  // Get raw bitmap data for comparison
  return thumbnail.toBitmap();
}

/**
 * Check current screen against baseline
 * Returns whether a significant change was detected and the difference percentage
 */
export async function checkAgainstBaseline(): Promise<{changed: boolean, difference: number}> {
  if (!isRunning) {
    console.log('[Visual Detector] Cannot check - not running');
    return { changed: false, difference: 0 };
  }

  if (baselineHash === null) {
    console.log('[Visual Detector] No baseline set - updating baseline');
    await updateBaseline();
    return { changed: false, difference: 0 };
  }

  try {
    const currentImageData = await captureSample();
    const currentHash = calculateDHash(
      currentImageData,
      VISUAL_DETECTOR_CONFIG.SAMPLE_WIDTH,
      VISUAL_DETECTOR_CONFIG.SAMPLE_HEIGHT
    );

    const difference = hammingDistance(baselineHash, currentHash);

    console.log(`[Visual Detector] Baseline comparison: ${difference.toFixed(1)}%`);

    const changed = difference >= VISUAL_DETECTOR_CONFIG.DHASH_THRESHOLD_PERCENT;
    
    if (changed) {
      console.log(`[Visual Detector] Significant change detected (>=${VISUAL_DETECTOR_CONFIG.DHASH_THRESHOLD_PERCENT}%)`);
    }

    return { changed, difference };
  } catch (error) {
    console.error('Error checking against baseline:', error);
    return { changed: false, difference: 0 };
  }
}

/**
 * Update the baseline to the current screen state
 * Call this after capturing a screenshot or on startup
 */
export async function updateBaseline(): Promise<void> {
  if (!isRunning) {
    console.log('[Visual Detector] Cannot update baseline - not running');
    return;
  }

  try {
    const currentImageData = await captureSample();
    baselineHash = calculateDHash(
      currentImageData,
      VISUAL_DETECTOR_CONFIG.SAMPLE_WIDTH,
      VISUAL_DETECTOR_CONFIG.SAMPLE_HEIGHT
    );
    console.log('[Visual Detector] Baseline updated');
  } catch (error) {
    console.error('Error updating baseline:', error);
  }
}

/**
 * Start visual detection (event-driven mode)
 */
export function startVisualDetection(): void {
  if (isRunning) {
    console.log('[Visual Detector] Already running');
    return;
  }

  if (!VISUAL_DETECTOR_CONFIG.ENABLED) {
    console.log('[Visual Detector] Disabled in config');
    return;
  }

  console.log(`[Visual Detector] Starting (threshold: ${VISUAL_DETECTOR_CONFIG.DHASH_THRESHOLD_PERCENT}%)`);
  isRunning = true;
  baselineHash = null;
}

/**
 * Stop visual detection
 */
export function stopVisualDetection(): void {
  if (!isRunning) {
    console.log('[Visual Detector] Not running');
    return;
  }

  console.log('[Visual Detector] Stopping');
  isRunning = false;
  baselineHash = null;
}

/**
 * Check if visual detection is currently running
 */
export function isDetecting(): boolean {
  return isRunning;
}

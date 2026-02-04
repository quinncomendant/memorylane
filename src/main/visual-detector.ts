import { desktopCapturer } from 'electron';
import { VISUAL_DETECTOR_CONFIG } from '../shared/constants';

// State
let previousImageData: Buffer | null = null;
let detectorIntervalId: NodeJS.Timeout | null = null;
let lastCaptureTime = 0;
let lastChangeDetectionTime = 0; // Track last time we detected a change (for debouncing)
let isRunning = false;

// Callback for when significant change is detected
type OnChangeDetectedCallback = (confidence: number) => void;
const changeCallbacks: OnChangeDetectedCallback[] = [];

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
 */
function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return 100;
  
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  
  return (distance / hash1.length) * 100;
}

/**
 * Detect clustered changes (meaningful UI events) vs scattered changes (noise/video)
 * Returns {clustered: percentage, scattered: percentage}
 */
function analyzeChangeDistribution(buffer1: Buffer, buffer2: Buffer, width: number, height: number): { clustered: number; scattered: number } {
  const changedPixels: boolean[] = [];
  const threshold = 40; // Color distance threshold
  
  // Mark changed pixels
  for (let i = 0; i < buffer1.length; i += 4) {
    const r1 = buffer1[i], g1 = buffer1[i + 1], b1 = buffer1[i + 2];
    const r2 = buffer2[i], g2 = buffer2[i + 1], b2 = buffer2[i + 2];
    const distance = Math.sqrt(
      Math.pow(r2 - r1, 2) + Math.pow(g2 - g1, 2) + Math.pow(b2 - b1, 2)
    );
    changedPixels.push(distance > threshold);
  }
  
  // Divide into regions (grid-based clustering)
  const regionSize = 16; // 16x16 pixel regions
  const regionsX = Math.floor(width / regionSize);
  const regionsY = Math.floor(height / regionSize);
  const regionChanges: number[] = [];
  
  for (let ry = 0; ry < regionsY; ry++) {
    for (let rx = 0; rx < regionsX; rx++) {
      let regionChanged = 0;
      
      // Count changes in this region
      for (let py = 0; py < regionSize; py++) {
        for (let px = 0; px < regionSize; px++) {
          const x = rx * regionSize + px;
          const y = ry * regionSize + py;
          const idx = y * width + x;
          if (idx < changedPixels.length && changedPixels[idx]) {
            regionChanged++;
          }
        }
      }
      
      const regionPercent = (regionChanged / (regionSize * regionSize)) * 100;
      regionChanges.push(regionPercent);
    }
  }
  
  // Categorize regions: high change (>15%) = active, low change = noise
  const activeRegions = regionChanges.filter(r => r > 15).length;
  const totalRegions = regionChanges.length;
  
  // Calculate how "spread out" the changes are
  const activeRatio = activeRegions / totalRegions;
  
  // Key insight: video/animation affects MOST of screen uniformly
  // Text changes / UI events affect SOME regions significantly
  if (activeRatio > 0.5) {
    // More than 50% of regions changed = likely video/fullscreen animation
    return { clustered: 0, scattered: activeRatio * 100 };
  } else if (activeRatio > 0.03) {
    // 3-50% of regions = meaningful change (text, windows, UI)
    return { clustered: activeRatio * 100, scattered: 0 };
  } else {
    // Less than 3% = very minor (cursor, clock, single element, blinking)
    return { clustered: 0, scattered: activeRatio * 100 };
  }
}

/**
 * Smart visual change detection:
 * 1. Quick perceptual hash check (ignores minor variations)
 * 2. Region-based clustering analysis (detects meaningful vs noise)
 * Returns confidence score (0-100) for meaningful change
 */
function calculateSemanticDifference(buffer1: Buffer, buffer2: Buffer, width: number, height: number): number {
  if (buffer1.length !== buffer2.length) {
    return 100; // Completely different if sizes don't match
  }

  // Step 1: Quick perceptual hash check
  const hash1 = calculateDHash(buffer1, width, height);
  const hash2 = calculateDHash(buffer2, width, height);
  const hashDiff = hammingDistance(hash1, hash2);
  
  // If hashes are very similar, skip detailed analysis (cursor-only changes)
  if (hashDiff < 3) {
    return 0; // Essentially identical (just cursor, clock, or blinking elements)
  }
  
  // Step 2: Analyze change distribution
  const { clustered, scattered } = analyzeChangeDistribution(buffer1, buffer2, width, height);
  
  // Debug logging (always log when hash differs to help tune)
  if (hashDiff >= 3) {
    console.log(`[Visual Detector] hashDiff: ${hashDiff.toFixed(1)}%, clustered: ${clustered.toFixed(1)}%, scattered: ${scattered.toFixed(1)}%`);
  }
  
  // Clustered changes = meaningful (text changes, new window, UI state change)
  // Scattered changes = noise (video, animations across whole screen)
  let confidence = 0;
  if (clustered > 0) {
    // Weight clustered changes heavily - these are what we want
    confidence = Math.min(100, hashDiff + clustered * 2);
    console.log(`  → CLUSTERED change detected, confidence: ${confidence.toFixed(1)}%`);
  } else if (scattered > 0) {
    // Scattered changes across screen = likely video/animation, downweight heavily
    confidence = Math.min(100, hashDiff * 0.2);
    console.log(`  → SCATTERED change (noise), confidence: ${confidence.toFixed(1)}%`);
  } else {
    // No significant regional changes but hash differs = minor stuff
    confidence = hashDiff * 0.5;
    console.log(`  → MINOR change (no clear clustering), confidence: ${confidence.toFixed(1)}%`);
  }
  
  return confidence;
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
 * Check for visual changes and trigger callbacks if threshold exceeded
 */
async function checkForChanges(): Promise<void> {
  try {
    const currentImageData = await captureSample();

    if (previousImageData) {
      const changeConfidence = calculateSemanticDifference(
        previousImageData,
        currentImageData,
        VISUAL_DETECTOR_CONFIG.SAMPLE_WIDTH,
        VISUAL_DETECTOR_CONFIG.SAMPLE_HEIGHT
      );

      if (changeConfidence >= VISUAL_DETECTOR_CONFIG.CHANGE_THRESHOLD_PERCENT) {
        // High confidence: capture immediately, no debounce
        if (changeConfidence >= VISUAL_DETECTOR_CONFIG.HIGH_CONFIDENCE_THRESHOLD) {
          console.log(`HIGH confidence change (${changeConfidence.toFixed(2)}%) - capturing immediately`);
          lastCaptureTime = Date.now();
          lastChangeDetectionTime = Date.now();

          // Notify all callbacks
          changeCallbacks.forEach((callback) => {
            try {
              callback(changeConfidence);
            } catch (error) {
              console.error('Error in change detection callback:', error);
            }
          });
        }
        // Low confidence: apply debounce
        else {
          const timeSinceLastChange = Date.now() - lastChangeDetectionTime;
          
          if (timeSinceLastChange < VISUAL_DETECTOR_CONFIG.DEBOUNCE_MS) {
            console.log(`Low confidence change (${changeConfidence.toFixed(2)}%) debounced (${(timeSinceLastChange / 1000).toFixed(1)}s since last)`);
            return; // Skip this capture
          }
          
          console.log(`Low confidence change (${changeConfidence.toFixed(2)}%) - capturing after debounce`);
          lastCaptureTime = Date.now();
          lastChangeDetectionTime = Date.now();

          // Notify all callbacks
          changeCallbacks.forEach((callback) => {
            try {
              callback(changeConfidence);
            } catch (error) {
              console.error('Error in change detection callback:', error);
            }
          });
        }
      }
    }

    // Store current sample for next comparison
    previousImageData = currentImageData;

    // Check if we should trigger fallback timer
    if (VISUAL_DETECTOR_CONFIG.FALLBACK_TO_TIMER) {
      const timeSinceLastCapture = Date.now() - lastCaptureTime;
      if (timeSinceLastCapture >= VISUAL_DETECTOR_CONFIG.FALLBACK_TIMER_MS) {
        console.log('Fallback timer triggered - no significant changes detected');
        lastCaptureTime = Date.now();

        // Trigger capture via callbacks with 0 confidence
        changeCallbacks.forEach((callback) => {
          try {
            callback(0);
          } catch (error) {
            console.error('Error in fallback timer callback:', error);
          }
        });
      }
    }
  } catch (error) {
    console.error('Error checking for visual changes:', error);
  }
}

/**
 * Start monitoring for visual changes
 */
export function startVisualDetection(): void {
  if (isRunning) {
    console.log('Visual detection already running');
    return;
  }

  if (!VISUAL_DETECTOR_CONFIG.ENABLED) {
    console.log('Visual detection is disabled');
    return;
  }

  console.log('Starting visual change detection');
  isRunning = true;
  lastCaptureTime = Date.now();
  lastChangeDetectionTime = 0; // Reset debounce timer
  previousImageData = null;

  // Start periodic checking
  detectorIntervalId = setInterval(() => {
    checkForChanges();
  }, VISUAL_DETECTOR_CONFIG.SAMPLE_INTERVAL_MS);

  // Do initial check
  checkForChanges();
}

/**
 * Stop monitoring for visual changes
 */
export function stopVisualDetection(): void {
  if (!isRunning) {
    console.log('Visual detection not running');
    return;
  }

  console.log('Stopping visual change detection');
  isRunning = false;

  if (detectorIntervalId) {
    clearInterval(detectorIntervalId);
    detectorIntervalId = null;
  }

  previousImageData = null;
}

/**
 * Register a callback to be notified when significant changes are detected
 */
export function onChangeDetected(callback: OnChangeDetectedCallback): void {
  changeCallbacks.push(callback);
}

/**
 * Check if visual detection is currently running
 */
export function isDetecting(): boolean {
  return isRunning;
}

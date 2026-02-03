import { app, desktopCapturer } from 'electron';
// eslint-disable-next-line import/no-unresolved
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { Screenshot, OnScreenshotCallback } from '../shared/types';
import { CAPTURE_INTERVAL_MS } from '../shared/constants';

// Configuration
const SCREENSHOTS_DIR = path.join(app.getPath('userData'), 'screenshots');

// State
let captureIntervalId: NodeJS.Timeout | null = null;
const screenshotCallbacks: OnScreenshotCallback[] = [];
let isCapturing = false;

// Ensure screenshots directory exists
function ensureScreenshotsDir(): void {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

/**
 * Capture a screenshot from the primary display
 */
export async function captureNow(): Promise<Screenshot> {
  ensureScreenshotsDir();

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: 1920 * 2, // Support high DPI displays
      height: 1080 * 2,
    },
  });

  if (sources.length === 0) {
    throw new Error('No screen sources available for capture');
  }

  // Use the primary display (first source)
  const primarySource = sources[0];
  const thumbnail = primarySource.thumbnail;

  // Generate screenshot metadata
  const id = uuidv4();
  const timestamp = Date.now();
  const filename = `${timestamp}_${id}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);

  // Get actual thumbnail dimensions
  const size = thumbnail.getSize();

  // Save the screenshot
  const pngBuffer = thumbnail.toPNG();
  fs.writeFileSync(filepath, pngBuffer);

  const screenshot: Screenshot = {
    id,
    filepath,
    timestamp,
    display: {
      id: parseInt(primarySource.id.split(':')[1] || '0', 10),
      width: size.width,
      height: size.height,
    },
  };

  // Notify all registered callbacks
  screenshotCallbacks.forEach((callback) => {
    try {
      callback(screenshot);
    } catch (error) {
      console.error('Error in screenshot callback:', error);
    }
  });

  return screenshot;
}

/**
 * Start capturing screenshots at the configured interval
 */
export function startCapture(): void {
  if (isCapturing) {
    console.log('Capture already running');
    return;
  }

  console.log(`Starting screenshot capture every ${CAPTURE_INTERVAL_MS}ms`);
  isCapturing = true;

  // Capture immediately on start
  captureNow().catch((error) => {
    console.error('Failed to capture initial screenshot:', error);
  });

  // Then capture at intervals
  captureIntervalId = setInterval(() => {
    captureNow().catch((error) => {
      console.error('Failed to capture screenshot:', error);
    });
  }, CAPTURE_INTERVAL_MS);
}

/**
 * Stop capturing screenshots
 */
export function stopCapture(): void {
  if (!isCapturing) {
    console.log('Capture not running');
    return;
  }

  console.log('Stopping screenshot capture');
  isCapturing = false;

  if (captureIntervalId) {
    clearInterval(captureIntervalId);
    captureIntervalId = null;
  }
}

/**
 * Register a callback to be notified when screenshots are captured
 */
export function onScreenshot(callback: OnScreenshotCallback): void {
  screenshotCallbacks.push(callback);
}

/**
 * Get the directory where screenshots are saved
 */
export function getScreenshotsDir(): string {
  return SCREENSHOTS_DIR;
}

/**
 * Check if capture is currently running
 */
export function isCapturingNow(): boolean {
  return isCapturing;
}

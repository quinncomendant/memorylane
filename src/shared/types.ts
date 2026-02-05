export interface Screenshot {
  id: string;              // UUID
  filepath: string;        // Absolute path to PNG
  timestamp: number;       // Unix ms
  display: {
    id: number;
    width: number;
    height: number;
  };
  trigger: CaptureReason;  // Why was this screenshot taken
}

export interface CaptureReason {
  type: 'timer' | 'baseline_change' | 'manual';
  confidence?: number;  // Visual change percentage (0-100) for baseline_change
  metadata?: Record<string, unknown>;
}

export interface InteractionContext {
  type: 'click' | 'keyboard' | 'scroll' | 'app_change';
  timestamp: number;

  // Click-specific
  clickPosition?: { x: number; y: number };

  // Keyboard-specific
  keyCount?: number;      // Number of keys pressed in typing session
  durationMs?: number;    // Duration of typing session in milliseconds

  // Scroll-specific
  scrollDirection?: 'vertical' | 'horizontal';
  scrollAmount?: number;  // Accumulated scroll delta

  // Window/app context
  activeWindow?: {
    title: string;
    processName: string;
  };

  // App change-specific
  previousWindow?: {
    title: string;
    processName: string;
  };
}

export type OnScreenshotCallback = (screenshot: Screenshot) => void;

export interface ClassificationInput {
  startScreenshot: Screenshot;
  endScreenshot?: Screenshot;  // Optional for single-image mode (app change)
  events: InteractionContext[];
}

export interface ClassificationResult {
  summary: string;
  timestamp: number;
}

export interface SearchFilters {
  startTime?: number;  // Unix ms
  endTime?: number;    // Unix ms
  appName?: string;    // Exact match
}

export interface SearchOptions extends SearchFilters {
  limit?: number;
}

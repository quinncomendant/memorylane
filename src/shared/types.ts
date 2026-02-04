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
  type: 'timer' | 'visual_change' | 'user_interaction' | 'manual';
  confidence?: number;  // For visual change detection (0-100)
  metadata?: Record<string, unknown>;
}

export interface InteractionContext {
  type: 'click' | 'keyboard' | 'scroll';
  timestamp: number;

  // Click-specific
  clickPosition?: { x: number; y: number };
  clickedElement?: ElementInfo;

  // Keyboard-specific
  keyCount?: number;      // Number of keys pressed in typing session
  durationMs?: number;    // Duration of typing session in milliseconds

  // Window/app context
  activeWindow?: {
    title: string;
    processName: string;
    bundleId?: string;  // macOS
  };

  // State snapshots
  preInteractionScreenshot?: string;  // filepath
  postInteractionScreenshot?: string; // filepath
}

export interface ElementInfo {
  label?: string;        // Button text, link text, etc.
  role?: string;         // button, link, input, etc.
  accessible?: boolean;  // Whether we could read it
  hierarchy?: string[];  // Parent element labels
}

export type OnScreenshotCallback = (screenshot: Screenshot) => void;

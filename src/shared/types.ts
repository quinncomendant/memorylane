export interface Screenshot {
  id: string;              // UUID
  filepath: string;        // Absolute path to PNG
  timestamp: number;       // Unix ms
  display: {
    id: number;
    width: number;
    height: number;
  };
}

export type OnScreenshotCallback = (screenshot: Screenshot) => void;

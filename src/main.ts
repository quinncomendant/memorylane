import { app, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import * as capture from './main/capture';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let tray: Tray | null = null;

// Prevent app from quitting when all windows are closed (tray app)
app.on('window-all-closed', () => {
  // Don't quit - this is a tray app
});

const createTray = () => {
  // Try to load custom icon, fall back to default
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  let icon: Electron.NativeImage;

  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Use a default icon if custom icon not found
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('MemoryLane - Screen Capture');

  updateTrayMenu();

  // Optional: Register a callback to log captures
  capture.onScreenshot((screenshot) => {
    console.log('Screenshot captured:', {
      id: screenshot.id,
      timestamp: new Date(screenshot.timestamp).toISOString(),
      filepath: screenshot.filepath,
    });
  });
};

const updateTrayMenu = () => {
  if (!tray) return;

  const isCapturing = capture.isCapturingNow();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isCapturing ? 'Stop Capture' : 'Start Capture',
      click: () => {
        if (isCapturing) {
          capture.stopCapture();
        } else {
          capture.startCapture();
        }
        updateTrayMenu();
      },
    },
    {
      label: 'Capture Now',
      click: async () => {
        try {
          const screenshot = await capture.captureNow();
          console.log('Manual capture successful:', screenshot.id);
        } catch (error) {
          console.error('Manual capture failed:', error);
        }
      },
    },
    { type: 'separator' },
    {
      label: `Screenshots: ${capture.getScreenshotsDir()}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        capture.stopCapture();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
};

// This method will be called when Electron has finished initialization
app.on('ready', () => {
  createTray();
  console.log('MemoryLane started. Screenshots will be saved to:', capture.getScreenshotsDir());
});

// macOS: Prevent dock icon from showing (optional for tray-only app)
if (process.platform === 'darwin') {
  app.dock?.hide();
}

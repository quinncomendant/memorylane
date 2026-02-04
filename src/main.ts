import { app, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import * as capture from './main/capture';
import * as interactionMonitor from './main/interaction-monitor';

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

  // Subscribe to screenshot events (visual change only)
  capture.onScreenshot((screenshot) => {
    const logData: Record<string, unknown> = {
      id: screenshot.id,
      timestamp: new Date(screenshot.timestamp).toISOString(),
      filepath: screenshot.filepath,
      trigger: screenshot.trigger.type,
    };

    if (screenshot.trigger.confidence) {
      logData.changePercent = screenshot.trigger.confidence.toFixed(2) + '%';
    }

    console.log('Screenshot captured:', logData);
  });

  // Subscribe to interaction events (independent stream)
  interactionMonitor.onInteraction((event) => {
    const logData: Record<string, unknown> = {
      type: event.type,
      timestamp: new Date(event.timestamp).toISOString(),
    };

    if (event.clickPosition) {
      logData.clickPosition = event.clickPosition;
    }

    if (event.keyCount) {
      logData.keyCount = event.keyCount;
    }

    if (event.durationMs) {
      logData.durationMs = event.durationMs;
    }

    console.log('Interaction event:', logData);
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
          interactionMonitor.stopInteractionMonitoring();
        } else {
          capture.startCapture();
          // Start interaction monitoring separately
          try {
            interactionMonitor.startInteractionMonitoring();
          } catch (error) {
            console.error('Failed to start interaction monitoring:', error);
            console.log('Continuing without interaction monitoring');
          }
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
        interactionMonitor.stopInteractionMonitoring();
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

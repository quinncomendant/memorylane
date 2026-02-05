import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { ApiKeyManager } from './api-key-manager';
import { SemanticClassifierService } from '../processor/semantic-classifier';

let settingsWindow: BrowserWindow | null = null;

/**
 * Open (or focus) the settings window
 */
export function openSettingsWindow(): void {
  // If window already exists, focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Settings',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the settings page
  // In dev mode, load from dev server; in production, load from file
  if (process.env.NODE_ENV === 'development') {
    settingsWindow.loadURL('http://localhost:5173/settings.html');
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

let classifierService: SemanticClassifierService | null = null;

/**
 * Initialize IPC handlers for settings
 */
export function initSettingsIPC(apiKeyManager: ApiKeyManager, classifier?: SemanticClassifierService): void {
  console.log('[SettingsIPC] Initializing IPC handlers...');
  classifierService = classifier || null;

  // Get current key status
  ipcMain.handle('settings:getKeyStatus', () => {
    console.log('[SettingsIPC] settings:getKeyStatus handler called');
    const status = apiKeyManager.getKeyStatus();
    console.log('[SettingsIPC] Returning status:', status);
    return status;
  });

  // Save API key
  ipcMain.handle('settings:saveApiKey', (_event: IpcMainInvokeEvent, key: string) => {
    try {
      apiKeyManager.saveApiKey(key);
      // Update the classifier with the new API key
      if (classifierService) {
        classifierService.updateApiKey(key);
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Delete API key
  ipcMain.handle('settings:deleteApiKey', () => {
    try {
      apiKeyManager.deleteApiKey();
      // Clear the API key from the classifier
      if (classifierService) {
        classifierService.updateApiKey(null);
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Close settings window
  ipcMain.on('settings:close', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });
}

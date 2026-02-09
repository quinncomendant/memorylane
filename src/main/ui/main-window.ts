/**
 * Main application window for MemoryLane
 *
 * Provides a visible control surface alongside the system tray.
 * Singleton window that hides on close instead of destroying.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import log from '../logger'
import { updateTrayMenu } from './tray'
import { registerWithClaudeDesktop } from '../integrations/claude-desktop'
import { registerWithCursor } from '../integrations/cursor'
import { registerWithClaudeCode } from '../integrations/claude-code'
import type { EventProcessor } from '../processor/index'
import type { ApiKeyManager } from '../settings/api-key-manager'
import type { SemanticClassifierService } from '../processor/semantic-classifier'
import type { MainWindowStats } from '../../shared/types'

interface MainWindowDependencies {
  recorder: {
    isCapturingNow: () => boolean
    startCapture: () => void
    stopCapture: () => void
  }
  interactionMonitor: {
    stopInteractionMonitoring: () => void
  }
  processor: EventProcessor
  apiKeyManager: ApiKeyManager
  classifierService: SemanticClassifierService
}

interface MainWindowStatus {
  capturing: boolean
}

let mainWindow: BrowserWindow | null = null
let deps: MainWindowDependencies | null = null

function buildStatus(): MainWindowStatus {
  return {
    capturing: deps?.recorder.isCapturingNow() ?? false,
  }
}

/**
 * Send current status to the renderer process
 */
export function sendStatusToRenderer(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const status = buildStatus()
  mainWindow.webContents.send('main-window:statusChanged', status)
}

/**
 * Open (or focus) the main application window
 */
export function openMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }

  mainWindow = new BrowserWindow({
    width: 600,
    height: 520,
    resizable: false,
    minimizable: true,
    maximizable: false,
    title: 'MemoryLane',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173/main-window.html')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/main-window.html'))
  }

  mainWindow.on('close', (e) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

/**
 * Get the main window instance
 */
export function getMainWindow(): BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }
  return null
}

/**
 * Build stats for the main window
 */
async function buildStats(): Promise<MainWindowStats> {
  if (!deps) {
    return {
      screenshotCount: 0,
      dbSize: 0,
      dateRange: { oldest: null, newest: null },
      apiUsage: null,
    }
  }

  const storage = deps.processor.getStorageService()
  const classifier = deps.processor.getClassifierService()

  let screenshotCount = 0
  let dbSize = 0
  const dateRange: { oldest: number | null; newest: number | null } = { oldest: null, newest: null }

  try {
    screenshotCount = await storage.countRows()
    dbSize = storage.getDbSize()
    const range = await storage.getDateRange()
    dateRange.oldest = range.oldest
    dateRange.newest = range.newest
  } catch (error) {
    log.error('[MainWindow] Error fetching storage stats:', error)
  }

  let apiUsage: { requestCount: number; totalCost: number } | null = null
  if (classifier) {
    const usageTracker = classifier.getUsageTracker()
    const stats = usageTracker.getStats()
    apiUsage = {
      requestCount: stats.requestCount,
      totalCost: stats.totalCost,
    }
  }

  return { screenshotCount, dbSize, dateRange, apiUsage }
}

/**
 * Initialize IPC handlers for the main window
 */
export function initMainWindowIPC(dependencies: MainWindowDependencies): void {
  deps = dependencies

  log.info('[MainWindow] Initializing IPC handlers...')

  ipcMain.handle('main-window:getStatus', () => {
    return buildStatus()
  })

  ipcMain.handle('main-window:toggleCapture', () => {
    if (!deps) {
      return { capturing: false }
    }

    if (deps.recorder.isCapturingNow()) {
      deps.recorder.stopCapture()
      deps.interactionMonitor.stopInteractionMonitoring()
    } else {
      deps.recorder.startCapture()
    }

    void updateTrayMenu()

    return buildStatus()
  })

  // API key management
  ipcMain.handle('main-window:getKeyStatus', () => {
    if (!deps) {
      return { hasKey: false, source: 'none', maskedKey: null }
    }
    return deps.apiKeyManager.getKeyStatus()
  })

  ipcMain.handle('main-window:saveApiKey', (_event: IpcMainInvokeEvent, key: string) => {
    if (!deps) {
      return { success: false, error: 'Dependencies not initialized' }
    }
    try {
      deps.apiKeyManager.saveApiKey(key)
      deps.classifierService.updateApiKey(key)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('main-window:deleteApiKey', () => {
    if (!deps) {
      return { success: false, error: 'Dependencies not initialized' }
    }
    try {
      deps.apiKeyManager.deleteApiKey()
      deps.classifierService.updateApiKey(null)
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // Integrations
  ipcMain.handle('main-window:addToClaude', () => registerWithClaudeDesktop())
  ipcMain.handle('main-window:addToCursor', () => registerWithCursor())
  ipcMain.handle('main-window:addToClaudeCode', () => registerWithClaudeCode())

  // Stats
  ipcMain.handle('main-window:getStats', () => buildStats())
}

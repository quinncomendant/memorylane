/**
 * System tray management for MemoryLane
 */

import { app, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import log from '../logger'
import { formatBytes, formatNumber } from '../utils/formatters'
import type { StorageService } from '../storage'
import { sendStatusToRenderer, openMainWindow } from './main-window'
import { getUpdateState, quitAndInstall } from '../updater'

interface TrayDependencies {
  capture: {
    isCapturingNow: () => boolean
    requestStartCapture: () => void
    requestStopCapture: () => void
    stopCaptureForShutdown: () => void
    forceClose: () => Promise<void>
  }
  storage: StorageService
}

let tray: Tray | null = null
let deps: TrayDependencies | null = null
let privacyBlocked = false
const PRIVACY_BLOCKED_LATCH_MS = 20_000
let lastPrivacyBlockedAtMs: number | null = null

const isPrivacyBlockedRecently = (
  isCapturing: boolean,
  isPrivacyBlockedCurrently: boolean,
): boolean => {
  if (!isCapturing || isPrivacyBlockedCurrently || lastPrivacyBlockedAtMs === null) return false

  const elapsedMs = Date.now() - lastPrivacyBlockedAtMs
  if (elapsedMs > PRIVACY_BLOCKED_LATCH_MS) {
    lastPrivacyBlockedAtMs = null
    return false
  }

  return true
}

export const setPrivacyBlockedState = (blocked: boolean): void => {
  privacyBlocked = blocked
  if (blocked) {
    lastPrivacyBlockedAtMs = Date.now()
  }
  void updateTrayMenu()
}

app.on('before-quit', () => {
  if (tray) {
    tray.destroy()
    tray = null
  }

  // Safety net: force-exit if graceful shutdown takes too long.
  // In-flight async work (OCR subprocesses, embedding inference, API calls)
  // can keep the event loop alive indefinitely after app.quit().
  setTimeout(() => {
    log.warn('[Quit] Graceful shutdown timed out — force exiting')
    app.exit(0)
  }, 3000).unref()
})

/**
 * Build the usage stats submenu with API and storage statistics
 */
const buildUsageStatsSubmenu = async (): Promise<Electron.MenuItemConstructorOptions[]> => {
  const submenu: Electron.MenuItemConstructorOptions[] = []

  if (!deps?.storage) {
    submenu.push({
      label: 'Stats not available',
      enabled: false,
    })
    return submenu
  }

  try {
    const activityCount = deps.storage.activities.count()
    const dbSize = deps.storage.getDbSize()

    submenu.push(
      {
        label: `Activities: ${formatNumber(activityCount)}`,
        enabled: false,
      },
      {
        label: `Database: ${formatBytes(dbSize)}`,
        enabled: false,
      },
    )
  } catch (error) {
    log.error('Error fetching storage stats:', error)
    submenu.push({
      label: 'Storage stats unavailable',
      enabled: false,
    })
  }

  return submenu
}

/**
 * Update the tray context menu with current state
 */
export const updateTrayMenu = async (): Promise<void> => {
  if (!tray || !deps) return

  const isCapturing = deps.capture.isCapturingNow()
  const isPrivacyBlocked = isCapturing && privacyBlocked
  const blockedRecently = isPrivacyBlockedRecently(isCapturing, isPrivacyBlocked)
  tray.setToolTip(
    isPrivacyBlocked
      ? 'MemoryLane - Capture Paused (Privacy Rule)'
      : blockedRecently
        ? 'MemoryLane - Capture Recently Paused (Privacy Rule)'
        : 'MemoryLane - Screen Capture',
  )

  const usageStatsSubmenu = await buildUsageStatsSubmenu()

  const updateState = getUpdateState()
  const contextMenu = Menu.buildFromTemplate([
    ...(updateState === 'ready'
      ? [
          { label: 'Install Update Now (Restart)', click: () => quitAndInstall() },
          { type: 'separator' as const },
        ]
      : updateState === 'downloading'
        ? [{ label: 'Downloading Update...', enabled: false }, { type: 'separator' as const }]
        : []),
    ...(isPrivacyBlocked
      ? [
          {
            label: 'Capture paused: privacy rule matched',
            enabled: false,
          },
          { type: 'separator' as const },
        ]
      : blockedRecently
        ? [
            {
              label: 'Capture recently paused: privacy rule matched',
              enabled: false,
            },
            { type: 'separator' as const },
          ]
        : []),
    {
      label: isCapturing ? 'Stop Capture' : 'Start Capture',
      click: () => {
        if (isCapturing) {
          deps!.capture.requestStopCapture()
        } else {
          deps!.capture.requestStartCapture()
        }
        void updateTrayMenu()
        void sendStatusToRenderer()
      },
    },
    { type: 'separator' },
    {
      label: 'Usage Stats',
      submenu: usageStatsSubmenu,
    },
    {
      label: 'Open MemoryLane',
      click: () => {
        openMainWindow()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        void deps!.capture.forceClose()
        deps!.capture.stopCaptureForShutdown()
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
}
/**
 * Setup the system tray with icon, tooltip, and menu
 */
export const setupTray = (dependencies: TrayDependencies): void => {
  deps = dependencies

  const isDev = !app.isPackaged
  const iconPath = isDev
    ? path.join(app.getAppPath(), 'assets', 'tray-icon.png')
    : path.join(process.resourcesPath, 'assets', 'tray-icon.png')
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty()
    }
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)

  void updateTrayMenu()
}

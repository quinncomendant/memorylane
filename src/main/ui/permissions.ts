/**
 * macOS permissions management for Accessibility and Screen Recording
 */

import path from 'node:path'
import fs from 'node:fs'
import { systemPreferences, desktopCapturer, app, dialog, shell } from 'electron'
import log from '../logger'

/**
 * Ensure all required permissions are granted before starting the app.
 * Uses a phased approach: Accessibility first, then Screen Recording.
 * Opens the correct System Settings pane for each permission.
 * Handles the Screen Recording restart requirement gracefully.
 */
export const ensurePermissions = async (): Promise<void> => {
  // Non-macOS platforms don't need these permission checks
  if (process.platform !== 'darwin') {
    return
  }

  // Phase 1: Check and request Accessibility permission
  await ensureAccessibilityPermission()

  // Phase 2: Check and request Screen Recording permission
  await ensureScreenRecordingPermission()

  // Phase 3: Prompt user to allow notifications during screen recording
  await promptNotificationSettings()

  log.info('[Permissions] All permissions granted')
}

/**
 * Ensure Accessibility permission is granted.
 * Opens System Settings to the Accessibility pane if needed.
 */
const ensureAccessibilityPermission = async (): Promise<void> => {
  const hasAccessibility = systemPreferences.isTrustedAccessibilityClient(false)

  if (hasAccessibility) {
    log.info('[Permissions] Accessibility permission already granted')
    return
  }

  log.warn('[Permissions] Accessibility permission missing')

  // Trigger the native system prompt which includes an "Open System Settings" button
  systemPreferences.isTrustedAccessibilityClient(true)

  // Poll until Accessibility is granted
  return new Promise<void>((resolve) => {
    const POLL_INTERVAL_MS = 2000

    const pollId = setInterval(() => {
      const nowHasAccessibility = systemPreferences.isTrustedAccessibilityClient(false)

      if (nowHasAccessibility) {
        log.info('[Permissions] Accessibility permission granted')
        clearInterval(pollId)
        resolve()
      } else {
        log.info('[Permissions] Still waiting for Accessibility permission')
      }
    }, POLL_INTERVAL_MS)
  })
}

const NOTIFICATION_PROMPT_MARKER = '.notification-settings-prompted'

/**
 * Prompt the user to enable "Allow notifications when mirroring or sharing the display"
 * in macOS System Settings. Only shown once (marker file persists the dismissal).
 */
const promptNotificationSettings = async (): Promise<void> => {
  const markerPath = path.join(app.getPath('userData'), NOTIFICATION_PROMPT_MARKER)

  if (fs.existsSync(markerPath)) {
    log.info('[Permissions] Notification settings prompt already shown, skipping')
    return
  }

  log.info('[Permissions] Showing notification settings prompt')

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Allow Notifications',
    message: 'macOS hides notifications while screen recording is active.',
    detail:
      'To keep seeing notifications, enable "Allow notifications when mirroring or sharing the display" in System Settings > Notifications.',
    buttons: ['Open Settings', 'Skip'],
    defaultId: 0,
  })

  if (response === 0) {
    await shell.openExternal('x-apple.systempreferences:com.apple.Notifications-Settings')
  }

  fs.writeFileSync(markerPath, '', 'utf-8')
  log.info('[Permissions] Notification settings prompt completed')
}

/**
 * Ensure Screen Recording permission is granted.
 * Opens System Settings to the Screen Recording pane if needed.
 * Schedules app relaunch to handle macOS forced restart requirement.
 */
const ensureScreenRecordingPermission = async (): Promise<void> => {
  const hasScreenRecording = systemPreferences.getMediaAccessStatus('screen') === 'granted'

  if (hasScreenRecording) {
    log.info('[Permissions] Screen Recording permission already granted')
    return
  }

  log.warn('[Permissions] Screen Recording permission missing')

  // Trigger a trial capture so macOS registers the app in the Screen Recording list.
  // Without this, the app won't appear in System Settings for the user to toggle.
  try {
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
  } catch {
    log.info('[Permissions] Trial capture completed (permission not yet granted)')
  }

  // Schedule app relaunch for when macOS forces quit after granting permission
  app.relaunch()
  log.info('[Permissions] App relaunch scheduled for after Screen Recording grant')

  // Poll until Screen Recording is granted
  // This may never complete if macOS forces a quit, but we handle that with relaunch()
  return new Promise<void>((resolve) => {
    const POLL_INTERVAL_MS = 2000

    const pollId = setInterval(() => {
      const nowHasScreenRecording = systemPreferences.getMediaAccessStatus('screen') === 'granted'

      if (nowHasScreenRecording) {
        log.info('[Permissions] Screen Recording permission granted')
        clearInterval(pollId)
        resolve()
      } else {
        log.info('[Permissions] Still waiting for Screen Recording permission')
      }
    }, POLL_INTERVAL_MS)
  })
}

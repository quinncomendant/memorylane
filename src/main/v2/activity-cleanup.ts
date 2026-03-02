import * as fs from 'fs'
import * as path from 'path'
import log from '../logger'
import { SCREENSHOT_CLEANUP_CONFIG } from '../../shared/constants'
import type { V2Activity } from './activity-types'

export function cleanupActivityFiles(activity: V2Activity, videoOutputDir: string): void {
  let deleted = 0

  for (const activityFrame of activity.frames) {
    try {
      fs.unlinkSync(activityFrame.frame.filepath)
      deleted++
    } catch {
      log.warn(`[ActivityCleanup] Failed to delete frame: ${activityFrame.frame.filepath}`)
    }
  }

  const videoPath = `${videoOutputDir}/${activity.id}.mp4`
  try {
    fs.unlinkSync(videoPath)
    deleted++
  } catch {
    log.warn(`[ActivityCleanup] Failed to delete video: ${videoPath}`)
  }

  if (deleted > 0) {
    log.info(`[ActivityCleanup] Deleted ${deleted} file(s) for activity ${activity.id}`)
  }
}

export function sweepStaleFiles(outputDir: string): void {
  const now = Date.now()
  let deleted = 0
  try {
    for (const file of fs.readdirSync(outputDir)) {
      if (!file.endsWith('.png') && !file.endsWith('.jpg') && !file.endsWith('.mp4')) continue
      const filepath = path.join(outputDir, file)
      try {
        if (now - fs.statSync(filepath).mtimeMs > SCREENSHOT_CLEANUP_CONFIG.MAX_AGE_MS) {
          fs.unlinkSync(filepath)
          deleted++
        }
      } catch {
        // ignore per-file errors
      }
    }
  } catch (err) {
    log.warn('[ActivityCleanup] File cleanup sweep failed:', err)
  }
  if (deleted > 0) log.info(`[ActivityCleanup] Swept ${deleted} stale file(s)`)
}

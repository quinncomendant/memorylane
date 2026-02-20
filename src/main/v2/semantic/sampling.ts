import * as fs from 'fs'
import type { V2ActivityFrame } from '../activity-types'

export function selectSnapshotFrames(params: {
  frames: V2ActivityFrame[]
  maxSnapshots: number
  minSnapshotGapMs: number
}): V2ActivityFrame[] {
  const { frames, maxSnapshots, minSnapshotGapMs } = params

  const available = frames
    .filter((frame) => fs.existsSync(frame.frame.filepath))
    .sort((left, right) => {
      if (left.frame.timestamp !== right.frame.timestamp) {
        return left.frame.timestamp - right.frame.timestamp
      }
      return left.frame.sequenceNumber - right.frame.sequenceNumber
    })

  if (available.length === 0) {
    return []
  }

  if (available.length === 1 || maxSnapshots === 1) {
    return [available[0]]
  }

  const first = available[0]
  const last = available[available.length - 1]

  const selected: V2ActivityFrame[] = [first]
  let lastSelectedTs = first.frame.timestamp

  const middle = available.slice(1, -1)
  for (const frame of middle) {
    if (selected.length >= maxSnapshots - 1) {
      break
    }
    if (frame.frame.timestamp - lastSelectedTs < minSnapshotGapMs) {
      continue
    }

    selected.push(frame)
    lastSelectedTs = frame.frame.timestamp
  }

  const alreadyHasLast = selected.some(
    (frame) =>
      frame.frame.timestamp === last.frame.timestamp &&
      frame.frame.filepath === last.frame.filepath,
  )
  if (!alreadyHasLast && selected.length < maxSnapshots) {
    selected.push(last)
  }

  return selected
}

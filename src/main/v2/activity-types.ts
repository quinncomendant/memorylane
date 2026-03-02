import type { EventWindow, InteractionContext } from '../../shared/types'
import type { Frame } from './recorder/screen-capturer'
import type { Offset } from './streams/stream'
import { ACTIVITY_CONFIG } from '../../shared/constants'

export interface V2ActivityFrame {
  offset: Offset
  frame: Frame
}

export interface V2ActivityContext {
  appName: string
  bundleId?: string
  windowTitle?: string
  url?: string
  tld?: string
  displayId?: number
}

export interface V2ActivityProvenance {
  eventWindowOffsets: Offset[]
  frameOffsets: Offset[]
  sourceWindowIds: string[]
  sourceClosedBy: EventWindow['closedBy'][]
}

export interface V2Activity {
  id: string
  startTimestamp: number
  endTimestamp: number
  context: V2ActivityContext
  interactions: InteractionContext[]
  frames: V2ActivityFrame[]
  provenance: V2ActivityProvenance
}

export interface V2ActivityProducerConfig {
  frameJoinGraceMs: number
  maxFrameWaitMs: number
  minActivityDurationMs: number
  maxActivityDurationMs: number
  frameBufferRetentionMs: number
  eventConsumerId: string
  frameConsumerId: string
}

export function createDefaultV2ActivityProducerConfig(): V2ActivityProducerConfig {
  return {
    frameJoinGraceMs: 750,
    maxFrameWaitMs: 5_000,
    minActivityDurationMs: ACTIVITY_CONFIG.MIN_ACTIVITY_DURATION_MS,
    maxActivityDurationMs: ACTIVITY_CONFIG.MAX_ACTIVITY_DURATION_MS,
    frameBufferRetentionMs: ACTIVITY_CONFIG.MAX_ACTIVITY_DURATION_MS * 2,
    eventConsumerId: 'v2-activity-producer:event-stream',
    frameConsumerId: 'v2-activity-producer:frame-stream',
  }
}

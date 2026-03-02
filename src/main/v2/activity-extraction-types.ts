import type { V2Activity } from './activity-types'

export interface V2ExtractedActivity {
  activityId: string
  startTimestamp: number
  endTimestamp: number
  appName: string
  windowTitle: string
  tld?: string
  summary: string
  ocrText: string
  vector: number[]
}

export interface ActivityTransformer {
  transform(activity: V2Activity): Promise<V2ExtractedActivity>
}

export interface ActivitySink {
  persist(input: { activity: V2Activity; extracted: V2ExtractedActivity }): Promise<void>
}

export interface V2ActivityExtractorConfig {
  consumerId: string
  maxConcurrent: number
  maxRetries: number
  retryBackoffMs: number
  onTaskComplete?: (activity: V2Activity, outcome: 'succeeded' | 'dead-lettered') => void
}

export interface ActivityExtractorStats {
  queued: number
  inFlight: number
  succeeded: number
  failed: number
  retried: number
  deadLettered: number
  ackedOffset: number | null
}

export const DEFAULT_V2_ACTIVITY_EXTRACTOR_CONFIG: V2ActivityExtractorConfig = {
  consumerId: 'v2-activity-extractor:activity-stream',
  maxConcurrent: 1,
  maxRetries: 2,
  retryBackoffMs: 100,
}

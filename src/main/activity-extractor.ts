import log from './logger'
import type { V2Activity } from './activity-types'
import {
  DEFAULT_V2_ACTIVITY_EXTRACTOR_CONFIG,
  type ActivityExtractorStats,
  type ActivitySink,
  type ActivityTransformer,
  type V2ActivityExtractorConfig,
} from './activity-extraction-types'
import type { DurableStream, Offset, StreamRecord, StreamSubscription } from './streams/stream'

interface ExtractionTask {
  record: StreamRecord<V2Activity>
  attempt: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ActivityExtractor {
  private readonly activityStream: DurableStream<V2Activity>
  private readonly transformer: ActivityTransformer
  private readonly sink: ActivitySink
  private readonly config: V2ActivityExtractorConfig

  private subscription: StreamSubscription | null = null
  private started = false

  private pending: ExtractionTask[] = []
  private inFlight = 0
  private readonly completedOffsets = new Set<Offset>()
  private nextAckOffset: Offset | null = null
  private lastAckedOffset: Offset | null = null
  private ackChain: Promise<void> = Promise.resolve()

  private readonly idleWaiters: Array<() => void> = []

  private readonly counters = {
    succeeded: 0,
    failed: 0,
    retried: 0,
    deadLettered: 0,
  }

  constructor(params: {
    activityStream: DurableStream<V2Activity>
    transformer: ActivityTransformer
    sink: ActivitySink
    config?: Partial<V2ActivityExtractorConfig>
  }) {
    this.activityStream = params.activityStream
    this.transformer = params.transformer
    this.sink = params.sink
    this.config = {
      ...DEFAULT_V2_ACTIVITY_EXTRACTOR_CONFIG,
      ...(params.config ?? {}),
    }

    if (!Number.isInteger(this.config.maxConcurrent) || this.config.maxConcurrent <= 0) {
      throw new Error('maxConcurrent must be a positive integer')
    }
    if (!Number.isInteger(this.config.maxRetries) || this.config.maxRetries < 0) {
      throw new Error('maxRetries must be a non-negative integer')
    }
    if (this.config.retryBackoffMs < 0) {
      throw new Error('retryBackoffMs must be >= 0')
    }
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    const { startOffset, ack } = await this.resolveReplayState()
    this.lastAckedOffset = ack
    this.nextAckOffset = startOffset

    this.subscription = this.activityStream.subscribe({
      startAt: { type: 'offset', offset: startOffset },
      onRecord: (record) => this.enqueue(record),
    })
  }

  async stop(): Promise<void> {
    if (!this.started) return

    this.subscription?.unsubscribe()
    this.subscription = null

    this.tryDispatch()
    await this.waitForIdle()
    await this.ackChain

    this.started = false
  }

  getStats(): ActivityExtractorStats {
    return {
      queued: this.pending.length,
      inFlight: this.inFlight,
      succeeded: this.counters.succeeded,
      failed: this.counters.failed,
      retried: this.counters.retried,
      deadLettered: this.counters.deadLettered,
      ackedOffset: this.lastAckedOffset,
    }
  }

  private enqueue(record: StreamRecord<V2Activity>): void {
    if (!this.started) return
    this.pending.push({ record, attempt: 0 })
    this.tryDispatch()
  }

  private tryDispatch(): void {
    if (!this.started) return

    while (this.inFlight < this.config.maxConcurrent && this.pending.length > 0) {
      const task = this.pending.shift()!
      this.inFlight++

      void this.processTask(task)
        .catch((err) => {
          log.error(
            `[ActivityExtractor] Unexpected task failure at offset ${task.record.offset}:`,
            err,
          )
        })
        .finally(() => {
          this.inFlight--
          this.tryDispatch()
          this.resolveIdleIfNeeded()
        })
    }
  }

  private async processTask(task: ExtractionTask): Promise<void> {
    try {
      const extracted = await this.transformer.transform(task.record.payload)
      await this.sink.persist({
        activity: task.record.payload,
        extracted,
      })
      this.counters.succeeded++
      await this.markCompleted(task.record.offset)
      try {
        this.config.onTaskComplete?.(task.record.payload, 'succeeded')
      } catch (e) {
        log.warn('[ActivityExtractor] onTaskComplete callback error (succeeded):', e)
      }
      return
    } catch (err) {
      const nextAttempt = task.attempt + 1
      if (nextAttempt <= this.config.maxRetries) {
        this.counters.retried++
        const delay = this.config.retryBackoffMs * nextAttempt
        if (delay > 0) {
          await sleep(delay)
        }
        this.pending.push({ record: task.record, attempt: nextAttempt })
        return
      }

      this.counters.failed++
      this.counters.deadLettered++
      log.error(
        `[ActivityExtractor] Dead-lettering activity ${task.record.payload.id} at offset ${task.record.offset} after ${task.attempt} retries`,
        err,
      )
      await this.markCompleted(task.record.offset)
      try {
        this.config.onTaskComplete?.(task.record.payload, 'dead-lettered')
      } catch (e) {
        log.warn('[ActivityExtractor] onTaskComplete callback error (dead-lettered):', e)
      }
    }
  }

  private async markCompleted(offset: Offset): Promise<void> {
    this.completedOffsets.add(offset)
    this.ackChain = this.ackChain.then(() => this.advanceAckBarrier())
    await this.ackChain
  }

  private async advanceAckBarrier(): Promise<void> {
    if (this.nextAckOffset === null) return

    let highestContiguous: Offset | null = null
    while (this.completedOffsets.has(this.nextAckOffset)) {
      this.completedOffsets.delete(this.nextAckOffset)
      highestContiguous = this.nextAckOffset
      this.nextAckOffset++
    }

    if (highestContiguous === null) return

    await this.activityStream.ack(this.config.consumerId, highestContiguous)
    await this.activityStream.trimBefore(highestContiguous + 1)
    this.lastAckedOffset = highestContiguous
  }

  private async resolveReplayState(): Promise<{ startOffset: Offset; ack: Offset | null }> {
    const [lowest, ack] = await Promise.all([
      this.activityStream.getLowestAvailableOffset(),
      this.activityStream.getAck(this.config.consumerId),
    ])

    if (ack === null) {
      return {
        startOffset: lowest,
        ack: null,
      }
    }

    return {
      startOffset: Math.max(lowest, ack + 1),
      ack,
    }
  }

  private async waitForIdle(): Promise<void> {
    if (this.inFlight === 0 && this.pending.length === 0) {
      return
    }

    await new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }

  private resolveIdleIfNeeded(): void {
    if (this.inFlight !== 0 || this.pending.length !== 0) return
    if (this.idleWaiters.length === 0) return

    const waiters = this.idleWaiters.splice(0)
    for (const resolve of waiters) {
      resolve()
    }
  }
}

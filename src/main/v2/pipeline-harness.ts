import type { InteractionContext, EventWindow } from '../../shared/types'
import { EventCapturer } from './event-capturer'
import { ActivityProducer } from './activity-producer'
import type { V2Activity, V2ActivityProducerConfig } from './activity-types'
import { ActivityExtractor } from './activity-extractor'
import type {
  ActivitySink,
  ActivityTransformer,
  V2ActivityExtractorConfig,
} from './activity-extraction-types'
import { InMemoryStream } from './streams/in-memory-stream'
import { ScreenCapturer, type Frame } from './recorder/screen-capturer'

export interface V2PipelineHarness {
  frameStream: InMemoryStream<Frame>
  eventStream: InMemoryStream<EventWindow>
  activityStream: InMemoryStream<V2Activity>
  screenCapturer: ScreenCapturer
  eventCapturer: EventCapturer
  activityProducer: ActivityProducer
  activityExtractor?: ActivityExtractor
  start(): Promise<void>
  stop(): Promise<void>
  handleEvent(event: InteractionContext): void
}

export function createV2PipelineHarness(params: {
  outputDir: string
  frameIntervalMs?: number
  displayId?: number
  activityProducerConfig?: Partial<V2ActivityProducerConfig>
  activityExtractorConfig?: Partial<V2ActivityExtractorConfig>
  extractorTransformer?: ActivityTransformer
  extractorSink?: ActivitySink
}): V2PipelineHarness {
  const frameStream = new InMemoryStream<Frame>()
  const eventStream = new InMemoryStream<EventWindow>()
  const activityStream = new InMemoryStream<V2Activity>()

  const screenCapturer = new ScreenCapturer({
    intervalMs: params.frameIntervalMs,
    outputDir: params.outputDir,
    displayId: params.displayId,
    stream: frameStream,
  })
  const eventCapturer = new EventCapturer(eventStream)
  const activityProducer = new ActivityProducer({
    frameStream,
    eventStream,
    activityStream,
    config: params.activityProducerConfig,
  })

  if (
    (params.extractorTransformer && !params.extractorSink) ||
    (!params.extractorTransformer && params.extractorSink)
  ) {
    throw new Error('extractorTransformer and extractorSink must be provided together')
  }

  const activityExtractor =
    params.extractorTransformer && params.extractorSink
      ? new ActivityExtractor({
          activityStream,
          transformer: params.extractorTransformer,
          sink: params.extractorSink,
          config: params.activityExtractorConfig,
        })
      : undefined

  return {
    frameStream,
    eventStream,
    activityStream,
    screenCapturer,
    eventCapturer,
    activityProducer,
    activityExtractor,
    async start() {
      await activityProducer.start()
      if (activityExtractor) {
        await activityExtractor.start()
      }
      screenCapturer.start()
    },
    async stop() {
      screenCapturer.stop()
      await eventCapturer.flushAndWait()
      await activityProducer.stop()
      if (activityExtractor) {
        await activityExtractor.stop()
      }
      eventCapturer.destroy()
    },
    handleEvent(event: InteractionContext) {
      eventCapturer.handleEvent(event)
    },
  }
}

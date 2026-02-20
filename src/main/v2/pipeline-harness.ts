import type { InteractionContext, EventWindow } from '../../shared/types'
import { EventCapturer } from './event-capturer'
import { ActivityProducer } from './activity-producer'
import type { V2Activity, V2ActivityProducerConfig } from './activity-types'
import { InMemoryStream } from './streams/in-memory-stream'
import { ScreenCapturer, type Frame } from './recorder/screen-capturer'

export interface V2PipelineHarness {
  frameStream: InMemoryStream<Frame>
  eventStream: InMemoryStream<EventWindow>
  activityStream: InMemoryStream<V2Activity>
  screenCapturer: ScreenCapturer
  eventCapturer: EventCapturer
  activityProducer: ActivityProducer
  start(): Promise<void>
  stop(): Promise<void>
  handleEvent(event: InteractionContext): void
}

export function createV2PipelineHarness(params: {
  outputDir: string
  frameIntervalMs?: number
  displayId?: number
  activityProducerConfig?: Partial<V2ActivityProducerConfig>
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

  return {
    frameStream,
    eventStream,
    activityStream,
    screenCapturer,
    eventCapturer,
    activityProducer,
    async start() {
      await activityProducer.start()
      screenCapturer.start()
    },
    async stop() {
      screenCapturer.stop()
      await eventCapturer.flushAndWait()
      await activityProducer.stop()
      eventCapturer.destroy()
    },
    handleEvent(event: InteractionContext) {
      eventCapturer.handleEvent(event)
    },
  }
}

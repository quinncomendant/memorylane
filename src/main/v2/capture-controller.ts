import log from '../logger'
import type { V2PipelineHarness } from './pipeline-harness'

type InteractionMonitorModule = typeof import('../recorder/interaction-monitor')
type CaptureState = 'stopped' | 'starting' | 'running' | 'stopping'

export interface RuntimeCapture {
  isCapturingNow(): boolean
  startCapture(): void
  stopCapture(): void
  forceClose(): Promise<void>
  getScreenshotsDir(): string
  updateActivityWindowConfig(input: {
    minActivityDurationMs: number
    maxActivityDurationMs: number
  }): void
}

export interface RuntimeCaptureController extends RuntimeCapture {
  waitForIdle(): Promise<void>
}

export function createV2CaptureController(params: {
  harness: V2PipelineHarness
  interactionMonitor: InteractionMonitorModule
  outputDir: string
  onStateChanged: () => void
}): RuntimeCaptureController {
  let state: CaptureState = 'stopped'
  let transition: Promise<void> = Promise.resolve()

  const notify = (): void => {
    params.onStateChanged()
  }

  const runTransition = (task: () => Promise<void>): void => {
    transition = transition
      .then(task)
      .catch((error) => {
        log.error('[V2Capture] Transition failed:', error)
      })
      .finally(() => {
        notify()
      })
  }

  return {
    isCapturingNow(): boolean {
      return state === 'starting' || state === 'running'
    },
    startCapture(): void {
      if (state === 'running' || state === 'starting') return
      state = 'starting'
      notify()

      runTransition(async () => {
        try {
          await params.harness.start()
          params.interactionMonitor.startInteractionMonitoring()
          state = 'running'
          log.info('[V2Capture] Started')
        } catch (error) {
          state = 'stopped'
          try {
            params.interactionMonitor.stopInteractionMonitoring()
          } catch {
            // best-effort cleanup
          }
          throw error
        }
      })
    },
    stopCapture(): void {
      if (state === 'stopped' || state === 'stopping') return
      state = 'stopping'
      notify()

      runTransition(async () => {
        try {
          params.interactionMonitor.stopInteractionMonitoring()
        } catch (error) {
          log.error('[V2Capture] Failed to stop interaction monitor:', error)
        }

        try {
          await params.harness.stop()
          log.info('[V2Capture] Stopped')
        } finally {
          state = 'stopped'
        }
      })
    },
    async forceClose(): Promise<void> {
      params.harness.eventCapturer.flush()
      await params.harness.eventCapturer.waitForIdle()
    },
    getScreenshotsDir(): string {
      return params.outputDir
    },
    waitForIdle(): Promise<void> {
      return transition
    },
    updateActivityWindowConfig(input): void {
      params.harness.updateActivityWindowConfig(input)
    },
  }
}

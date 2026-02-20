import { v4 as uuidv4 } from 'uuid'
import { EVENT_CAPTURER_CONFIG } from '@constants'
import { EventWindow, InteractionContext } from '../../shared/types'
import log from '../logger'
import type { DurableStream } from './streams/stream'

export class EventCapturer {
  private readonly eventStream: DurableStream<EventWindow>

  private appendChain: Promise<void> = Promise.resolve()

  /**
   * The in-progress window accumulating events. `null` when idle (no events
   * since the last window closed). Created lazily on the first handleEvent()
   * call after a close.
   */
  private currentWindow: {
    id: string
    startTimestamp: number
    events: InteractionContext[]
  } | null = null

  /**
   * Boundary timestamp carried from the last closed window. The next opened
   * window starts from this boundary so adjacent windows stay contiguous.
   */
  private nextWindowStartTimestamp: number | null = null

  /**
   * Gap timer handle. Restarted on every handleEvent() call. When it fires
   * (no new event within GAP_TIMEOUT_MS), the current window closes with
   * closedBy: 'gap'. This is the primary close mechanism.
   */
  private gapTimer: NodeJS.Timeout | null = null

  /**
   * Max duration timer handle. Started once when a window opens. When it
   * fires (window has been open for MAX_WINDOW_DURATION_MS), the window
   * force-closes with closedBy: 'max_duration'. Safety valve only.
   */
  private maxDurationTimer: NodeJS.Timeout | null = null

  constructor(eventStream: DurableStream<EventWindow>) {
    this.eventStream = eventStream
  }

  /**
   * Ingest a single interaction event. This is the only entry point for data.
   * Synchronous, performs no I/O — just accumulates the event and manages timers.
   *
   * - If event is app_change and a window is open: closes it first.
   * - If no window is open: creates one (lazy open), starts max duration timer.
   * - Pushes the event into currentWindow.events.
   * - Resets the gap timer.
   */
  handleEvent(event: InteractionContext): void {
    // App change splits the current window before opening a new one
    if (event.type === 'app_change' && this.currentWindow !== null) {
      this.closeWindow('app_change')
    }

    // Lazy open: create a new window on the first event
    if (this.currentWindow === null) {
      const startTimestamp = this.nextWindowStartTimestamp ?? event.timestamp
      this.nextWindowStartTimestamp = null
      this.currentWindow = {
        id: uuidv4(),
        startTimestamp,
        events: [],
      }
      this.startMaxDurationTimer()
    }

    this.currentWindow.events.push(event)
    this.resetGapTimer()
  }

  /**
   * Gracefully close the current window and emit it to callbacks.
   * Sets closedBy: 'flush'. Used on sleep/lock/capture-stop.
   * No-op if no window is open.
   */
  flush(): void {
    if (this.currentWindow === null) return
    this.closeWindow('flush')
  }

  async waitForIdle(): Promise<void> {
    await this.appendChain
  }

  async flushAndWait(): Promise<void> {
    this.flush()
    await this.waitForIdle()
  }

  /**
   * Hard cleanup — clears all timers and discards any open window WITHOUT
   * emitting. Used on app quit where we don't need the partial data.
   */
  destroy(): void {
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer)
      this.gapTimer = null
    }
    if (this.maxDurationTimer !== null) {
      clearTimeout(this.maxDurationTimer)
      this.maxDurationTimer = null
    }
    this.currentWindow = null
    this.nextWindowStartTimestamp = null
  }

  /**
   * Close the current window with the given reason, build the EventWindow,
   * enqueue it for async stream append, and reset state for the next window.
   */
  private closeWindow(reason: EventWindow['closedBy']): void {
    if (this.currentWindow === null) return

    // Clear timers
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer)
      this.gapTimer = null
    }
    if (this.maxDurationTimer !== null) {
      clearTimeout(this.maxDurationTimer)
      this.maxDurationTimer = null
    }

    const events = this.currentWindow.events
    const lastEventTimestamp = events[events.length - 1].timestamp
    const endTimestamp = Math.max(this.currentWindow.startTimestamp, lastEventTimestamp)
    const window: EventWindow = {
      id: this.currentWindow.id,
      startTimestamp: this.currentWindow.startTimestamp,
      endTimestamp,
      events,
      closedBy: reason,
    }

    this.currentWindow = null
    this.nextWindowStartTimestamp = endTimestamp

    log.info(
      `[EventCapturer] Window closed (${reason}): ${window.events.length} events, ` +
        `${window.endTimestamp - window.startTimestamp}ms`,
    )
    this.enqueueWindow(window)
  }

  private resetGapTimer(): void {
    if (this.gapTimer !== null) {
      clearTimeout(this.gapTimer)
    }
    this.gapTimer = setTimeout(() => {
      this.gapTimer = null
      this.closeWindow('gap')
    }, EVENT_CAPTURER_CONFIG.GAP_TIMEOUT_MS)
  }

  private startMaxDurationTimer(): void {
    this.maxDurationTimer = setTimeout(() => {
      this.maxDurationTimer = null
      this.closeWindow('max_duration')
    }, EVENT_CAPTURER_CONFIG.MAX_WINDOW_DURATION_MS)
  }

  private enqueueWindow(window: EventWindow): void {
    const appendTask = this.appendChain.then(() => this.eventStream.append(window))

    this.appendChain = appendTask
      .then(() => undefined)
      .catch((err) => {
        log.error('[EventCapturer] Stream append failed:', err)
      })
  }
}

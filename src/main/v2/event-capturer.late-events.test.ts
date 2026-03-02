import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InteractionContext, EventWindow } from '../../shared/types'
import { InMemoryStream } from './streams/in-memory-stream'
import type { StreamSubscription } from './streams/stream'

vi.mock('@constants', () => ({
  EVENT_CAPTURER_CONFIG: {
    GAP_TIMEOUT_MS: 100,
    MAX_WINDOW_DURATION_MS: 500,
    LATE_EVENT_GRACE_MS: 80,
  },
}))

vi.mock('../logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { EventCapturer } from './event-capturer'

function makeEvent(
  overrides: Partial<InteractionContext> & { type: InteractionContext['type']; timestamp: number },
): InteractionContext {
  return {
    ...overrides,
  }
}

async function flushAsyncAppends(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('EventCapturer late event handling', () => {
  let capturer: EventCapturer
  let stream: InMemoryStream<EventWindow>
  let windows: EventWindow[]
  let windowsSubscription: StreamSubscription

  beforeEach(() => {
    vi.useFakeTimers()
    stream = new InMemoryStream<EventWindow>()
    windows = []
    capturer = new EventCapturer(stream)
    windowsSubscription = stream.subscribe({
      startAt: { type: 'now' },
      onRecord: (record) => windows.push(record.payload),
    })
  })

  afterEach(() => {
    windowsSubscription.unsubscribe()
    capturer.destroy()
    vi.useRealTimers()
  })

  it('routes late debounced events into the previous app window before finalizing it', async () => {
    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 1_000 }))

    // app_change closes the current window, but finalization waits for late arrivals
    capturer.handleEvent(
      makeEvent({
        type: 'app_change',
        timestamp: 2_000,
        activeWindow: { title: 'New App', processName: 'newapp' },
      }),
    )
    await flushAsyncAppends()
    expect(windows).toHaveLength(0)

    // Late event that occurred before app_change should be attached to previous window
    capturer.handleEvent(makeEvent({ type: 'click', timestamp: 1_700 }))

    vi.advanceTimersByTime(80)
    await flushAsyncAppends()
    expect(windows).toHaveLength(1)
    expect(windows[0].closedBy).toBe('app_change')
    expect(windows[0].events.map((event) => event.timestamp)).toEqual([1_000, 1_700])
    expect(windows[0].startTimestamp).toBe(1_000)
    expect(windows[0].endTimestamp).toBe(2_000)

    capturer.flush()
    await flushAsyncAppends()
    expect(windows).toHaveLength(2)
    expect(windows[1].closedBy).toBe('flush')
    expect(windows[1].events).toHaveLength(1)
    expect(windows[1].events[0].type).toBe('app_change')
    expect(windows[1].startTimestamp).toBe(2_000)
    expect(windows[1].endTimestamp).toBe(2_000)
  })
})

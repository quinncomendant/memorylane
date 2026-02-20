import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InteractionContext, EventWindow } from '../../shared/types'

// Use short timer values for fast tests
vi.mock('@constants', () => ({
  EVENT_CAPTURER_CONFIG: {
    GAP_TIMEOUT_MS: 100,
    MAX_WINDOW_DURATION_MS: 500,
  },
}))

// Stub logger to avoid electron-log import in test environment
vi.mock('../logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { EventCapturer, OnEventWindowCallback } from './event-capturer'

function makeEvent(
  overrides: Partial<InteractionContext> & { type: InteractionContext['type'] },
): InteractionContext {
  return {
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('EventCapturer', () => {
  let capturer: EventCapturer

  beforeEach(() => {
    vi.useFakeTimers()
    capturer = new EventCapturer()
  })

  afterEach(() => {
    capturer.destroy()
    vi.useRealTimers()
  })

  it('emits a window via gap closure after inactivity', () => {
    const windows: EventWindow[] = []
    capturer.onEventWindow((w) => windows.push(w))

    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 1000 }))
    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 1050 }))

    expect(windows).toHaveLength(0)

    // Advance past gap timeout (100ms mock)
    vi.advanceTimersByTime(100)

    expect(windows).toHaveLength(1)
    expect(windows[0].closedBy).toBe('gap')
    expect(windows[0].events).toHaveLength(2)
    expect(windows[0].startTimestamp).toBe(1000)
    expect(windows[0].endTimestamp).toBe(1050)
  })

  it('force-closes with max_duration when window exceeds max duration', () => {
    const windows: EventWindow[] = []
    capturer.onEventWindow((w) => windows.push(w))

    // Feed events continuously to keep the gap timer resetting
    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 1000 }))
    for (let i = 1; i <= 10; i++) {
      vi.advanceTimersByTime(80) // less than gap timeout (100ms)
      capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 1000 + i * 80 }))
    }

    // At this point ~800ms has passed. Max duration is 500ms, so the timer should
    // have fired at 500ms. The window should have been closed then.
    expect(windows).toHaveLength(1)
    expect(windows[0].closedBy).toBe('max_duration')

    // The events after max_duration fired opened a new window
    // Advance past gap timeout to close that second window
    vi.advanceTimersByTime(100)
    expect(windows).toHaveLength(2)
  })

  it('emits with flush when flush() is called', () => {
    const windows: EventWindow[] = []
    capturer.onEventWindow((w) => windows.push(w))

    capturer.handleEvent(makeEvent({ type: 'click', timestamp: 2000 }))
    capturer.flush()

    expect(windows).toHaveLength(1)
    expect(windows[0].closedBy).toBe('flush')
    expect(windows[0].events).toHaveLength(1)
  })

  it('flush is a no-op when no window is open', () => {
    const windows: EventWindow[] = []
    capturer.onEventWindow((w) => windows.push(w))

    capturer.flush()

    expect(windows).toHaveLength(0)
  })

  it('destroy discards open window without emitting', () => {
    const windows: EventWindow[] = []
    capturer.onEventWindow((w) => windows.push(w))

    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 3000 }))
    capturer.destroy()

    // Advance timers to ensure no delayed callbacks fire
    vi.advanceTimersByTime(1000)

    expect(windows).toHaveLength(0)
  })

  it('does not open a window until the first event', () => {
    const windows: EventWindow[] = []
    capturer.onEventWindow((w) => windows.push(w))

    // No events → flush is no-op
    capturer.flush()
    expect(windows).toHaveLength(0)

    // Advance timers — still nothing
    vi.advanceTimersByTime(1000)
    expect(windows).toHaveLength(0)
  })

  it('supports registering and removing callbacks', () => {
    const windowsA: EventWindow[] = []
    const windowsB: EventWindow[] = []
    const cbA: OnEventWindowCallback = (w) => windowsA.push(w)
    const cbB: OnEventWindowCallback = (w) => windowsB.push(w)

    capturer.onEventWindow(cbA)
    capturer.onEventWindow(cbB)

    capturer.handleEvent(makeEvent({ type: 'click', timestamp: 4000 }))
    capturer.flush()

    expect(windowsA).toHaveLength(1)
    expect(windowsB).toHaveLength(1)

    // Remove cbA
    capturer.clearEventWindowCallback(cbA)

    capturer.handleEvent(makeEvent({ type: 'click', timestamp: 5000 }))
    capturer.flush()

    expect(windowsA).toHaveLength(1) // unchanged
    expect(windowsB).toHaveLength(2)
  })

  it('isolates callback errors — one throwing callback does not break others', () => {
    const windows: EventWindow[] = []
    const throwingCb: OnEventWindowCallback = () => {
      throw new Error('boom')
    }

    capturer.onEventWindow(throwingCb)
    capturer.onEventWindow((w) => windows.push(w))

    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 6000 }))
    capturer.flush()

    expect(windows).toHaveLength(1)
  })

  it('preserves event insertion order in the emitted window', () => {
    const windows: EventWindow[] = []
    capturer.onEventWindow((w) => windows.push(w))

    const events = [
      makeEvent({ type: 'keyboard', timestamp: 7000 }),
      makeEvent({ type: 'click', timestamp: 7010 }),
      makeEvent({ type: 'scroll', timestamp: 7020 }),
    ]

    for (const e of events) {
      capturer.handleEvent(e)
    }
    capturer.flush()

    expect(windows[0].events).toHaveLength(3)
    expect(windows[0].events[0].type).toBe('keyboard')
    expect(windows[0].events[1].type).toBe('click')
    expect(windows[0].events[2].type).toBe('scroll')
  })

  it('produces multiple consecutive windows with unique ids', () => {
    const windows: EventWindow[] = []
    capturer.onEventWindow((w) => windows.push(w))

    // First window
    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 8000 }))
    vi.advanceTimersByTime(100) // gap close

    // Second window
    capturer.handleEvent(makeEvent({ type: 'click', timestamp: 9000 }))
    vi.advanceTimersByTime(100) // gap close

    expect(windows).toHaveLength(2)
    expect(windows[0].id).not.toBe(windows[1].id)
    expect(windows[0].closedBy).toBe('gap')
    expect(windows[1].closedBy).toBe('gap')
  })

  it('splits window on app_change — previous window emitted, app_change becomes first event of new window', () => {
    const windows: EventWindow[] = []
    capturer.onEventWindow((w) => windows.push(w))

    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 10000 }))
    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 10050 }))

    // App change splits the window
    capturer.handleEvent(
      makeEvent({
        type: 'app_change',
        timestamp: 10100,
        activeWindow: { title: 'New App', processName: 'newapp' },
        previousWindow: { title: 'Old App', processName: 'oldapp' },
      }),
    )

    // First window should have been emitted with the keyboard events
    expect(windows).toHaveLength(1)
    expect(windows[0].closedBy).toBe('app_change')
    expect(windows[0].events).toHaveLength(2)
    expect(windows[0].events[0].type).toBe('keyboard')
    expect(windows[0].events[1].type).toBe('keyboard')
    expect(windows[0].endTimestamp).toBe(10050)

    // The app_change event is in a new (still open) window — flush to verify
    capturer.flush()

    expect(windows).toHaveLength(2)
    expect(windows[1].closedBy).toBe('flush')
    expect(windows[1].events).toHaveLength(1)
    expect(windows[1].events[0].type).toBe('app_change')
    expect(windows[1].startTimestamp).toBe(10100)
  })

  it('gap timer resets on each event', () => {
    const windows: EventWindow[] = []
    capturer.onEventWindow((w) => windows.push(w))

    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 11000 }))

    // Advance 80ms (less than 100ms gap) and feed another event
    vi.advanceTimersByTime(80)
    capturer.handleEvent(makeEvent({ type: 'keyboard', timestamp: 11080 }))

    // Advance another 80ms — should not close yet (gap restarted)
    vi.advanceTimersByTime(80)
    expect(windows).toHaveLength(0)

    // Advance remaining 20ms to hit 100ms after last event
    vi.advanceTimersByTime(20)
    expect(windows).toHaveLength(1)
    expect(windows[0].events).toHaveLength(2)
  })
})

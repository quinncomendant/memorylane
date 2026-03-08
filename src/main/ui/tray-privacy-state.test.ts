import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTrayPrivacyState } from './tray-privacy-state'

describe('tray privacy state', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports blocked state while capture is blocked', () => {
    const state = createTrayPrivacyState({
      onRecentlyBlockedExpired: vi.fn(),
      latchMs: 1000,
    })

    state.setBlocked(true)
    expect(state.getStatus(true)).toEqual({
      isPrivacyBlocked: true,
      blockedRecently: false,
    })
    state.dispose()
  })

  it('expires recently blocked state and notifies when latch elapses', () => {
    vi.useFakeTimers()
    const onRecentlyBlockedExpired = vi.fn()
    const state = createTrayPrivacyState({
      onRecentlyBlockedExpired,
      latchMs: 1000,
    })

    state.setBlocked(true)
    expect(state.getStatus(true)).toEqual({
      isPrivacyBlocked: true,
      blockedRecently: false,
    })

    state.setBlocked(false)
    expect(state.getStatus(true)).toEqual({
      isPrivacyBlocked: false,
      blockedRecently: true,
    })

    vi.advanceTimersByTime(1050)
    expect(onRecentlyBlockedExpired).toHaveBeenCalledTimes(1)
    expect(state.getStatus(true)).toEqual({
      isPrivacyBlocked: false,
      blockedRecently: false,
    })
    state.dispose()
  })

  it('hides blocked and recently blocked states when not capturing', () => {
    const state = createTrayPrivacyState({
      onRecentlyBlockedExpired: vi.fn(),
      latchMs: 1000,
    })

    state.setBlocked(true)
    expect(state.getStatus(false)).toEqual({
      isPrivacyBlocked: false,
      blockedRecently: false,
    })

    state.setBlocked(false)
    expect(state.getStatus(false)).toEqual({
      isPrivacyBlocked: false,
      blockedRecently: false,
    })
    state.dispose()
  })
})

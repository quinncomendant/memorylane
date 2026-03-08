interface TrayPrivacyStatus {
  isPrivacyBlocked: boolean
  blockedRecently: boolean
}

interface CreateTrayPrivacyStateParams {
  onRecentlyBlockedExpired: () => void
  latchMs?: number
}

interface TrayPrivacyState {
  setBlocked: (blocked: boolean) => void
  getStatus: (isCapturing: boolean) => TrayPrivacyStatus
  dispose: () => void
}

const DEFAULT_LATCH_MS = 20_000

export const createTrayPrivacyState = (params: CreateTrayPrivacyStateParams): TrayPrivacyState => {
  const latchMs = params.latchMs ?? DEFAULT_LATCH_MS
  let privacyBlocked = false
  let lastPrivacyBlockedAtMs: number | null = null
  let latchTimer: ReturnType<typeof setTimeout> | null = null

  const clearLatchTimer = (): void => {
    if (!latchTimer) return
    clearTimeout(latchTimer)
    latchTimer = null
  }

  const isBlockedRecently = (isCapturing: boolean, isPrivacyBlockedCurrently: boolean): boolean => {
    if (!isCapturing || isPrivacyBlockedCurrently || lastPrivacyBlockedAtMs === null) return false

    const elapsedMs = Date.now() - lastPrivacyBlockedAtMs
    if (elapsedMs > latchMs) {
      lastPrivacyBlockedAtMs = null
      return false
    }

    return true
  }

  const scheduleExpiryRefresh = (
    isCapturing: boolean,
    isPrivacyBlockedCurrently: boolean,
  ): void => {
    clearLatchTimer()
    if (!isCapturing || isPrivacyBlockedCurrently || lastPrivacyBlockedAtMs === null) return

    const elapsedMs = Date.now() - lastPrivacyBlockedAtMs
    const remainingMs = latchMs - elapsedMs
    if (remainingMs <= 0) {
      lastPrivacyBlockedAtMs = null
      return
    }

    latchTimer = setTimeout(() => {
      latchTimer = null
      params.onRecentlyBlockedExpired()
    }, remainingMs + 50)
    latchTimer.unref?.()
  }

  return {
    setBlocked: (blocked: boolean): void => {
      privacyBlocked = blocked
      clearLatchTimer()
      if (blocked) {
        lastPrivacyBlockedAtMs = Date.now()
      }
    },

    getStatus: (isCapturing: boolean): TrayPrivacyStatus => {
      const isPrivacyBlocked = isCapturing && privacyBlocked
      const blockedRecently = isBlockedRecently(isCapturing, isPrivacyBlocked)
      scheduleExpiryRefresh(isCapturing, isPrivacyBlocked)
      return {
        isPrivacyBlocked,
        blockedRecently,
      }
    },

    dispose: (): void => {
      clearLatchTimer()
    },
  }
}

import { describe, expect, it } from 'vitest'
import { ScreenshotDaemon } from './native-screenshot'

describe('ScreenshotDaemon', () => {
  it('exports ScreenshotDaemon class', () => {
    expect(ScreenshotDaemon).toBeDefined()
    expect(typeof ScreenshotDaemon).toBe('function')
  })

  it('send is a no-op before start', () => {
    const daemon = new ScreenshotDaemon()
    // Should not throw — just logs a warning
    daemon.send({ displayId: 1 })
  })
})

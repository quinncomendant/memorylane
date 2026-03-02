import { describe, expect, it, vi } from 'vitest'
import type { ScreenCaptureBackend } from './native-screenshot'

vi.mock('../../logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const mockBackend: ScreenCaptureBackend = {
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  send: vi.fn(),
}

vi.mock('./native-screenshot', () => ({
  createScreenCaptureBackend: () => mockBackend,
}))

// Import after mocks are set up
const { ScreenCapturer } = await import('./screen-capturer')
const { InMemoryStream } = await import('../streams/in-memory-stream')

describe('ScreenCapturer.setDisplayId', () => {
  it('does not send command when displayId has not changed', () => {
    const stream = new InMemoryStream()
    const capturer = new ScreenCapturer({ outputDir: '/tmp/test', stream })

    capturer.setDisplayId(2)
    capturer.setDisplayId(2)
    capturer.setDisplayId(2)

    expect(mockBackend.send).toHaveBeenCalledTimes(1)
    expect(mockBackend.send).toHaveBeenCalledWith({ displayId: 2 })
  })

  it('sends command when displayId changes', () => {
    vi.mocked(mockBackend.send).mockClear()
    const stream = new InMemoryStream()
    const capturer = new ScreenCapturer({ outputDir: '/tmp/test', stream })

    capturer.setDisplayId(1)
    capturer.setDisplayId(2)
    capturer.setDisplayId(3)

    expect(mockBackend.send).toHaveBeenCalledTimes(3)
    expect(mockBackend.send).toHaveBeenNthCalledWith(1, { displayId: 1 })
    expect(mockBackend.send).toHaveBeenNthCalledWith(2, { displayId: 2 })
    expect(mockBackend.send).toHaveBeenNthCalledWith(3, { displayId: 3 })
  })

  it('treats undefined and null as equivalent (reset to main)', () => {
    vi.mocked(mockBackend.send).mockClear()
    const stream = new InMemoryStream()
    const capturer = new ScreenCapturer({ outputDir: '/tmp/test', stream })

    capturer.setDisplayId(undefined)
    capturer.setDisplayId(undefined)

    expect(mockBackend.send).toHaveBeenCalledTimes(1)
    expect(mockBackend.send).toHaveBeenCalledWith({ displayId: null })
  })

  it('sends command when switching back to a previous displayId', () => {
    vi.mocked(mockBackend.send).mockClear()
    const stream = new InMemoryStream()
    const capturer = new ScreenCapturer({ outputDir: '/tmp/test', stream })

    capturer.setDisplayId(1)
    capturer.setDisplayId(2)
    capturer.setDisplayId(1)

    expect(mockBackend.send).toHaveBeenCalledTimes(3)
  })
})

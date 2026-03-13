import { describe, expect, it, vi } from 'vitest'
import { createCaptureCoordinator } from './capture-orchestrator'

function createCaptureMock() {
  return {
    isCapturingNow: vi.fn().mockReturnValue(false),
    startCapture: vi.fn(),
    stopCapture: vi.fn(),
    forceClose: vi.fn().mockResolvedValue(undefined),
    getScreenshotsDir: vi.fn().mockReturnValue('/tmp'),
    setFrameCaptureSuppressed: vi.fn(),
    updateActivityWindowConfig: vi.fn(),
  }
}

function createCaptureStateManagerMock() {
  return {
    setCaptureEnabled: vi.fn(),
    isCaptureEnabled: vi.fn().mockReturnValue(true),
  }
}

describe('createCaptureCoordinator', () => {
  it('schedules background analyzers on manual start when not paused', () => {
    const capture = createCaptureMock()
    const stateManager = createCaptureStateManagerMock()
    const userContextBuilder = { scheduleRun: vi.fn() }
    const patternDetector = { scheduleRun: vi.fn() }

    const coordinator = createCaptureCoordinator({
      capture,
      captureStateManager: stateManager as never,
      isPaused: () => false,
      userContextBuilder: userContextBuilder as never,
      patternDetector: patternDetector as never,
    })

    coordinator.controls.requestStartCapture()

    expect(stateManager.setCaptureEnabled).toHaveBeenCalledWith(true)
    expect(capture.startCapture).toHaveBeenCalledTimes(1)
    expect(userContextBuilder.scheduleRun).toHaveBeenCalledTimes(1)
    expect(patternDetector.scheduleRun).toHaveBeenCalledTimes(1)
  })

  it('does not start capture or schedule analyzers on manual start while paused', () => {
    const capture = createCaptureMock()
    const stateManager = createCaptureStateManagerMock()
    const userContextBuilder = { scheduleRun: vi.fn() }
    const patternDetector = { scheduleRun: vi.fn() }

    const coordinator = createCaptureCoordinator({
      capture,
      captureStateManager: stateManager as never,
      isPaused: () => true,
      userContextBuilder: userContextBuilder as never,
      patternDetector: patternDetector as never,
    })

    coordinator.controls.requestStartCapture()

    expect(stateManager.setCaptureEnabled).toHaveBeenCalledWith(true)
    expect(capture.startCapture).not.toHaveBeenCalled()
    expect(userContextBuilder.scheduleRun).not.toHaveBeenCalled()
    expect(patternDetector.scheduleRun).not.toHaveBeenCalled()
  })

  it('keeps scheduling behavior on resume path', () => {
    const capture = createCaptureMock()
    const stateManager = createCaptureStateManagerMock()
    const userContextBuilder = { scheduleRun: vi.fn() }
    const patternDetector = { scheduleRun: vi.fn() }

    const coordinator = createCaptureCoordinator({
      capture,
      captureStateManager: stateManager as never,
      isPaused: () => false,
      userContextBuilder: userContextBuilder as never,
      patternDetector: patternDetector as never,
    })

    coordinator.resumeCaptureIfDesired('resume')

    expect(capture.startCapture).toHaveBeenCalledTimes(1)
    expect(userContextBuilder.scheduleRun).toHaveBeenCalledTimes(1)
    expect(patternDetector.scheduleRun).toHaveBeenCalledTimes(1)
  })
})

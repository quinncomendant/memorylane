import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FfmpegVideoStitcher } from './video-stitcher'

const FFMPEG_EXECUTABLE_ENV = 'MEMORYLANE_FFMPEG_EXECUTABLE'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

interface MockChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
}

function createMockChildProcess(): MockChildProcess {
  const processEmitter = new EventEmitter() as MockChildProcess
  processEmitter.stdout = new EventEmitter()
  processEmitter.stderr = new EventEmitter()
  return processEmitter
}

describe('FfmpegVideoStitcher', () => {
  const tempDirs: string[] = []
  let ffmpegExecutablePath: string

  beforeEach(() => {
    vi.resetAllMocks()
    const tempDir = createTempDir()
    ffmpegExecutablePath = path.join(tempDir, 'ffmpeg')
    fs.writeFileSync(ffmpegExecutablePath, '#!/bin/sh\nexit 0\n')
    process.env[FFMPEG_EXECUTABLE_ENV] = ffmpegExecutablePath
  })

  afterEach(() => {
    delete process.env[FFMPEG_EXECUTABLE_ENV]
    cleanup()
  })

  function createTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-stitcher-unit-'))
    tempDirs.push(dir)
    return dir
  }

  function createFrame(tempDir: string, name: string): string {
    const framePath = path.join(tempDir, name)
    fs.writeFileSync(framePath, 'fake-frame')
    return framePath
  }

  function cleanup(): void {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  }

  it('builds ffmpeg command and returns stitch result', async () => {
    const childProcess = await import('child_process')
    const tempDir = createTempDir()
    const frameA = createFrame(tempDir, 'a.png')
    const frameB = createFrame(tempDir, 'b.png')
    const outputPath = path.join(tempDir, 'out.mp4')

    const mockChild = createMockChildProcess()
    vi.mocked(childProcess.spawn).mockReturnValue(
      mockChild as unknown as ReturnType<typeof childProcess.spawn>,
    )

    const stitcher = new FfmpegVideoStitcher()
    const promise = stitcher.stitch({ framePaths: [frameA, frameB], outputPath })

    expect(childProcess.spawn).toHaveBeenCalledTimes(1)
    const [command, args] = vi.mocked(childProcess.spawn).mock.calls[0]
    expect(command).toBe(ffmpegExecutablePath)
    expect(args).toContain('-f')
    expect(args).toContain('concat')
    expect(args).toContain('-safe')
    expect(args).toContain('0')
    expect(args).toContain('-r')
    expect(args).toContain('1')
    expect(args).toContain('-c:v')
    expect(args).toContain('libx264')
    expect(args).toContain('-pix_fmt')
    expect(args).toContain('yuv420p')
    expect(args[args.length - 1]).toBe(path.resolve(outputPath))

    const concatPath = args[args.indexOf('-i') + 1]
    const manifestContent = fs.readFileSync(concatPath, 'utf8')
    expect(manifestContent.indexOf(path.resolve(frameA))).toBeLessThan(
      manifestContent.indexOf(path.resolve(frameB)),
    )

    mockChild.emit('close', 0)

    await expect(promise).resolves.toEqual({
      filepath: path.resolve(outputPath),
      frameCount: 2,
    })
    expect(fs.existsSync(concatPath)).toBe(false)
  })

  it('uses provided fps in ffmpeg arguments', async () => {
    const childProcess = await import('child_process')
    const tempDir = createTempDir()
    const frameA = createFrame(tempDir, 'a.png')
    const frameB = createFrame(tempDir, 'b.png')

    const mockChild = createMockChildProcess()
    vi.mocked(childProcess.spawn).mockReturnValue(
      mockChild as unknown as ReturnType<typeof childProcess.spawn>,
    )

    const stitcher = new FfmpegVideoStitcher()
    const promise = stitcher.stitch({
      framePaths: [frameA, frameB],
      fps: 2,
      outputPath: path.join(tempDir, 'out.mp4'),
    })

    mockChild.emit('close', 0)
    await promise

    const [, args] = vi.mocked(childProcess.spawn).mock.calls[0]
    const rIndex = args.indexOf('-r')
    expect(rIndex).toBeGreaterThanOrEqual(0)
    expect(args[rIndex + 1]).toBe('2')
  })

  it('rejects when less than 2 frames are provided', async () => {
    const stitcher = new FfmpegVideoStitcher()
    await expect(
      stitcher.stitch({ framePaths: [], outputPath: path.join(os.tmpdir(), 'out.mp4') }),
    ).rejects.toThrow('at least 2 frame paths')
  })

  it('rejects when a frame path is missing', async () => {
    const tempDir = createTempDir()
    const frameA = createFrame(tempDir, 'a.png')
    const missing = path.join(tempDir, 'missing.png')

    const stitcher = new FfmpegVideoStitcher()
    await expect(
      stitcher.stitch({
        framePaths: [frameA, missing],
        outputPath: path.join(tempDir, 'out.mp4'),
      }),
    ).rejects.toThrow(`Frame file not found: ${missing}`)
  })

  it('rejects when fps is invalid', async () => {
    const tempDir = createTempDir()
    const frameA = createFrame(tempDir, 'a.png')
    const frameB = createFrame(tempDir, 'b.png')

    const stitcher = new FfmpegVideoStitcher()
    await expect(
      stitcher.stitch({
        framePaths: [frameA, frameB],
        fps: 0,
        outputPath: path.join(tempDir, 'out.mp4'),
      }),
    ).rejects.toThrow('fps must be a positive number')
  })

  it('cleans up concat temp file when ffmpeg exits non-zero', async () => {
    const childProcess = await import('child_process')
    const tempDir = createTempDir()
    const frameA = createFrame(tempDir, 'a.png')
    const frameB = createFrame(tempDir, 'b.png')

    const mockChild = createMockChildProcess()
    vi.mocked(childProcess.spawn).mockReturnValue(
      mockChild as unknown as ReturnType<typeof childProcess.spawn>,
    )

    const stitcher = new FfmpegVideoStitcher()
    const promise = stitcher.stitch({
      framePaths: [frameA, frameB],
      outputPath: path.join(tempDir, 'out.mp4'),
    })

    const [, args] = vi.mocked(childProcess.spawn).mock.calls[0]
    const concatPath = args[args.indexOf('-i') + 1]
    expect(fs.existsSync(concatPath)).toBe(true)

    mockChild.stderr.emit('data', 'encoder failed')
    mockChild.emit('close', 1)

    await expect(promise).rejects.toThrow('ffmpeg exited with code 1: encoder failed')
    expect(fs.existsSync(concatPath)).toBe(false)
  })

  it('returns a clear error when ffmpeg is missing', async () => {
    const childProcess = await import('child_process')
    const tempDir = createTempDir()
    const frameA = createFrame(tempDir, 'a.png')
    const frameB = createFrame(tempDir, 'b.png')

    const mockChild = createMockChildProcess()
    vi.mocked(childProcess.spawn).mockReturnValue(
      mockChild as unknown as ReturnType<typeof childProcess.spawn>,
    )

    const stitcher = new FfmpegVideoStitcher()
    const promise = stitcher.stitch({
      framePaths: [frameA, frameB],
      outputPath: path.join(tempDir, 'out.mp4'),
    })

    const error = new Error('spawn ffmpeg ENOENT') as NodeJS.ErrnoException
    error.code = 'ENOENT'
    mockChild.emit('error', error)

    await expect(promise).rejects.toThrow(`ffmpeg executable not found: ${ffmpegExecutablePath}`)
  })
})

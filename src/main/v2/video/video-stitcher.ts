import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const DEFAULT_FPS = 1
const FFMPEG_EXECUTABLE_ENV = 'MEMORYLANE_FFMPEG_EXECUTABLE'

export interface VideoStitcherInput {
  framePaths: string[]
  fps?: number
  outputPath: string
}

export interface VideoStitcherResult {
  filepath: string
  frameCount: number
}

export interface VideoStitcher {
  stitch(input: VideoStitcherInput): Promise<VideoStitcherResult>
}

function escapeConcatPath(filepath: string): string {
  return filepath.replace(/'/g, "'\\''")
}

function assertFramePaths(framePaths: string[]): void {
  if (framePaths.length < 2) {
    throw new Error('Video stitcher requires at least 2 frame paths')
  }

  for (const framePath of framePaths) {
    if (!fs.existsSync(framePath)) {
      throw new Error(`Frame file not found: ${framePath}`)
    }
  }
}

function assertFps(fps: number): void {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`fps must be a positive number (received: ${fps})`)
  }
}

function buildConcatManifest(framePaths: string[], fps: number): string {
  const resolved = framePaths.map((framePath) => path.resolve(framePath))
  const durationSeconds = 1 / fps
  const lines: string[] = []

  for (const framePath of resolved) {
    lines.push(`file '${escapeConcatPath(framePath)}'`)
    lines.push(`duration ${durationSeconds.toFixed(6)}`)
  }

  // concat demuxer ignores the final duration entry unless the last file is repeated
  lines.push(`file '${escapeConcatPath(resolved[resolved.length - 1])}'`)

  return lines.join('\n') + '\n'
}

function resolveAsarUnpackedPath(filepath: string): string {
  return filepath.replace(/\.asar([/\\])/, '.asar.unpacked$1')
}

function resolveFfmpegStaticPath(): string {
  let resolvedPath: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    resolvedPath = require('ffmpeg-static') as string | null
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to resolve ffmpeg-static module: ${detail}`)
  }

  if (!resolvedPath) {
    throw new Error('ffmpeg-static did not provide a binary for this platform')
  }

  const candidatePaths = [resolvedPath, resolveAsarUnpackedPath(resolvedPath)]
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`ffmpeg-static executable not found at resolved path: ${resolvedPath}`)
}

function resolveFfmpegExecutable(): string {
  const overridePath = process.env[FFMPEG_EXECUTABLE_ENV]
  if (overridePath && overridePath.length > 0) {
    if (!fs.existsSync(overridePath)) {
      throw new Error(`ffmpeg executable override does not exist: ${overridePath}`)
    }
    return overridePath
  }

  return resolveFfmpegStaticPath()
}

function runFfmpeg(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let settled = false
    let stderr = ''

    const settleReject = (error: Error): void => {
      if (settled) return
      settled = true
      reject(error)
    }

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    proc.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        settleReject(new Error(`ffmpeg executable not found: ${command}`))
        return
      }
      settleReject(new Error(`Failed to spawn ffmpeg (${command}): ${error.message}`))
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true

      if (code === 0) {
        resolve()
        return
      }

      const details = stderr.trim()
      if (details.length > 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${details}`))
        return
      }

      reject(new Error(`ffmpeg exited with code ${code}`))
    })
  })
}

export class FfmpegVideoStitcher implements VideoStitcher {
  async stitch(input: VideoStitcherInput): Promise<VideoStitcherResult> {
    const fps = input.fps ?? DEFAULT_FPS
    assertFramePaths(input.framePaths)
    assertFps(fps)

    const outputPath = path.resolve(input.outputPath)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })

    const concatPath = path.join(
      os.tmpdir(),
      `memorylane-ffmpeg-concat-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
    )
    fs.writeFileSync(concatPath, buildConcatManifest(input.framePaths, fps), 'utf8')
    const ffmpegExecutable = resolveFfmpegExecutable()

    try {
      await runFfmpeg(ffmpegExecutable, [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatPath,
        '-r',
        String(fps),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        outputPath,
      ])
    } finally {
      try {
        fs.unlinkSync(concatPath)
      } catch {
        // best-effort cleanup
      }
    }

    return {
      filepath: outputPath,
      frameCount: input.framePaths.length,
    }
  }
}

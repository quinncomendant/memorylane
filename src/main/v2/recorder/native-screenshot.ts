import { type ChildProcess, spawn } from 'child_process'
import * as fs from 'fs'
import * as readline from 'readline'
import log from '../../logger'
import { getExecutable } from './native-screenshot-mac'

// MARK: - Push-based backend interface

export interface CapturedFrame {
  filepath: string
  timestamp: number
  width: number
  height: number
  displayId: number
}

export interface CaptureBackendConfig {
  outputDir: string
  intervalMs?: number
  maxDimensionPx?: number
  onFrame: (frame: CapturedFrame) => void
}

export type CaptureBackendCommand = {
  displayId?: number | null // null = reset to main display
  intervalMs?: number
}

export interface ScreenCaptureBackend {
  start(config: CaptureBackendConfig): Promise<void>
  stop(): Promise<void>
  send(command: CaptureBackendCommand): void
}

const PLATFORM_SCREEN_CAPTURE_BACKENDS: Partial<
  Record<NodeJS.Platform, () => ScreenCaptureBackend>
> = {
  darwin: () => new ScreenshotDaemon(),
}

export function createScreenCaptureBackend(): ScreenCaptureBackend {
  const factory = PLATFORM_SCREEN_CAPTURE_BACKENDS[process.platform]
  if (!factory) {
    throw new Error(`Screen capture is not supported on platform "${process.platform}"`)
  }
  return factory()
}

// MARK: - ScreenshotDaemon (autonomous push-based SCK daemon)

const DAEMON_MAX_RESTARTS = 5
const DAEMON_RESTART_BACKOFF_MS = 1_000

export class ScreenshotDaemon implements ScreenCaptureBackend {
  private process: ChildProcess | null = null
  private rl: readline.Interface | null = null
  private restartCount = 0
  private started = false
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private config: CaptureBackendConfig | null = null

  async start(config: CaptureBackendConfig): Promise<void> {
    if (this.started) return
    this.config = config
    fs.mkdirSync(config.outputDir, { recursive: true })
    this.started = true
    this.restartCount = 0
    await this.spawnDaemon()
  }

  async stop(): Promise<void> {
    if (!this.started) return
    this.started = false
    this.config = null
    this.cancelScheduledRestart()
    this.killProcess()
  }

  send(command: CaptureBackendCommand): void {
    if (!this.started || !this.process?.stdin?.writable) {
      log.warn('[ScreenshotDaemon] Cannot send command: daemon not running')
      return
    }

    const payload: Record<string, unknown> = {}
    if (command.displayId !== undefined) {
      payload.displayId = command.displayId
    }
    if (command.intervalMs !== undefined) {
      payload.intervalMs = command.intervalMs
    }

    this.process.stdin.write(JSON.stringify(payload) + '\n')
  }

  private async spawnDaemon(): Promise<void> {
    const { command, args } = getExecutable()
    const config = this.config!

    const daemonArgs = [
      ...args,
      '--outputDir',
      config.outputDir,
      '--intervalMs',
      String(config.intervalMs ?? 1000),
      '--format',
      'jpeg',
      '--quality',
      '80',
    ]

    if (config.maxDimensionPx !== undefined) {
      daemonArgs.push('--maxDimension', String(config.maxDimensionPx))
    }

    log.info('[ScreenshotDaemon] Spawning daemon process')
    const proc = spawn(command, daemonArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.process = proc

    const rl = readline.createInterface({ input: proc.stdout! })
    this.rl = rl

    rl.on('line', (line) => {
      this.handleLine(line)
    })

    proc.stderr?.on('data', (chunk) => {
      const msg = chunk.toString().trim()
      if (msg) {
        log.warn(`[ScreenshotDaemon:stderr] ${msg}`)
      }
    })

    proc.on('error', (err) => {
      log.error('[ScreenshotDaemon] Process error:', err)
      this.handleProcessExit()
    })

    proc.on('close', (code) => {
      log.warn(`[ScreenshotDaemon] Process exited with code ${code}`)
      this.handleProcessExit()
    })
  }

  private handleLine(line: string): void {
    let parsed: CapturedFrame
    try {
      parsed = JSON.parse(line) as CapturedFrame
    } catch {
      log.warn(`[ScreenshotDaemon] Invalid JSON from daemon: ${line}`)
      return
    }

    if (!parsed.filepath || !parsed.timestamp) {
      log.warn(`[ScreenshotDaemon] Incomplete frame data: ${line}`)
      return
    }

    // Reset restart count on successful frame
    this.restartCount = 0

    this.config?.onFrame(parsed)
  }

  private handleProcessExit(): void {
    this.rl?.close()
    this.rl = null
    this.process = null

    if (!this.started) return

    if (this.restartCount >= DAEMON_MAX_RESTARTS) {
      log.error(`[ScreenshotDaemon] Max restarts (${DAEMON_MAX_RESTARTS}) reached, giving up`)
      this.started = false
      return
    }

    this.restartCount++
    const delay = DAEMON_RESTART_BACKOFF_MS * this.restartCount
    log.info(
      `[ScreenshotDaemon] Scheduling restart ${this.restartCount}/${DAEMON_MAX_RESTARTS} in ${delay}ms`,
    )

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (!this.started) return
      this.spawnDaemon().catch((err) => {
        log.error('[ScreenshotDaemon] Restart failed:', err)
      })
    }, delay)
  }

  private cancelScheduledRestart(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }

  private killProcess(): void {
    if (this.process) {
      try {
        this.process.stdin?.end()
        this.process.kill('SIGTERM')
      } catch {
        // best-effort
      }
      this.process = null
    }
    this.rl?.close()
    this.rl = null
  }
}

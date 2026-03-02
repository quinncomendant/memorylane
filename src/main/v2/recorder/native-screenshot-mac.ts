import * as fs from 'fs'
import * as path from 'path'

const SCREENSHOT_EXECUTABLE_ENV = 'MEMORYLANE_SCREENSHOT_EXECUTABLE'

interface ScreenshotExecutable {
  readonly command: string
  readonly args: readonly string[]
}

export function getExecutable(): ScreenshotExecutable {
  const overridePath = process.env[SCREENSHOT_EXECUTABLE_ENV]
  if (overridePath && overridePath.length > 0) {
    if (!fs.existsSync(overridePath)) {
      throw new Error(`screenshot executable override does not exist: ${overridePath}`)
    }
    return { command: overridePath, args: [] }
  }

  let isPackaged = false
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    isPackaged = require('electron').app.isPackaged
  } catch {
    // Running under ELECTRON_RUN_AS_NODE — treat as dev
  }

  if (isPackaged) {
    const binaryPath = path.join(process.resourcesPath, 'swift', 'screenshot')
    if (fs.existsSync(binaryPath)) {
      return { command: binaryPath, args: [] }
    }
    throw new Error(`screenshot binary not found at ${binaryPath}`)
  }

  const devBinaryPath = path.resolve(process.cwd(), 'build', 'swift', 'screenshot')
  if (fs.existsSync(devBinaryPath)) {
    return { command: devBinaryPath, args: [] }
  }

  throw new Error(
    `screenshot binary not found at ${devBinaryPath}. Run "npm run build:swift" before starting capture.`,
  )
}

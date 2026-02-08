import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

/**
 * Resolves the path to the Swift OCR script.
 * In development, it looks in the src directory.
 * In production, it looks in the resources directory.
 */
function getOcrScriptPath(): string {
  if (app.isPackaged) {
    const prodPath = path.join(process.resourcesPath, 'swift', 'ocr.swift')
    if (fs.existsSync(prodPath)) {
      return prodPath
    }
    throw new Error(`OCR script not found at ${prodPath}`)
  }

  const devPath = path.resolve(process.cwd(), 'src', 'main', 'processor', 'swift', 'ocr.swift')
  if (fs.existsSync(devPath)) {
    return devPath
  }

  throw new Error(`OCR script not found at ${devPath}`)
}

/**
 * Extracts text from an image using the native macOS Vision framework via a Swift sidecar script.
 *
 * @param filepath Absolute path to the image file
 * @returns Promise resolving to the extracted text
 * @throws Error if the file doesn't exist or the OCR process fails
 */
export async function extractText(filepath: string): Promise<string> {
  const scriptPath = getOcrScriptPath()

  return new Promise((resolve, reject) => {
    // Basic validation
    if (!fs.existsSync(filepath)) {
      return reject(new Error(`Image file not found: ${filepath}`))
    }

    const swift = spawn('swift', [scriptPath, filepath])

    let stdoutData = ''
    let stderrData = ''

    swift.stdout.on('data', (data) => {
      stdoutData += data.toString()
    })

    swift.stderr.on('data', (data) => {
      stderrData += data.toString()
    })

    swift.on('close', (code) => {
      if (code !== 0) {
        // The Swift script exits with 1 on known errors (missing file, Vision error)
        return reject(
          new Error(
            `OCR process failed with code ${code}: ${stderrData.trim() || 'Unknown error'}`,
          ),
        )
      }

      // Success: return the trimmed text
      // Note: "No text found" results in empty string (exit code 0), which is valid.
      resolve(stdoutData.trim())
    })

    swift.on('error', (err) => {
      reject(new Error(`Failed to spawn swift process: ${err.message}`))
    })
  })
}

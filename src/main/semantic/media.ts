import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'
import { LLM_IMAGE_MAX_WIDTH } from './constants'
import type { EncodedImage, VideoAssetData } from './types'
import type { V2ActivityFrame } from '../activity-types'

export function tryLoadVideoAsDataUrl(
  videoPath: string,
  maxVideoBytes: number,
): VideoAssetData | null {
  let stat: fs.Stats
  try {
    stat = fs.statSync(videoPath)
  } catch {
    return null
  }

  if (!stat.isFile() || stat.size <= 0 || stat.size > maxVideoBytes) {
    return null
  }

  const mimeType = mimeTypeForPath(videoPath)
  const videoBuffer = fs.readFileSync(videoPath)
  return {
    dataUrl: `data:${mimeType};base64,${videoBuffer.toString('base64')}`,
    sizeBytes: stat.size,
    mimeType,
  }
}

export async function encodeSnapshots(params: {
  frames: V2ActivityFrame[]
  onEncodeError?: (input: { filepath: string; error: unknown }) => void
}): Promise<EncodedImage[]> {
  const { frames, onEncodeError } = params
  const encoded: EncodedImage[] = []

  for (const frame of frames) {
    try {
      const dataUrl = await prepareImageDataUrl(frame.frame.filepath)
      encoded.push({ frame, dataUrl })
    } catch (error) {
      onEncodeError?.({ filepath: frame.frame.filepath, error })
    }
  }

  return encoded
}

async function prepareImageDataUrl(filepath: string): Promise<string> {
  const buffer = await sharp(filepath)
    .resize({ width: LLM_IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()

  return `data:image/jpeg;base64,${buffer.toString('base64')}`
}

function mimeTypeForPath(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase()
  switch (ext) {
    case '.mp4':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.webm':
      return 'video/webm'
    case '.m4v':
      return 'video/x-m4v'
    default:
      return 'application/octet-stream'
  }
}

import sharp from 'sharp'

const DHASH_WIDTH = 320
const DHASH_HEIGHT = 180

export async function loadImageDHash(filepath: string): Promise<string | null> {
  try {
    const { data, info } = await sharp(filepath)
      .ensureAlpha()
      .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    if (!info.channels || info.channels < 3) {
      return null
    }

    const grayscale = new Uint8Array(info.width * info.height)
    for (let pixel = 0, i = 0; pixel < grayscale.length; pixel++, i += info.channels) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      grayscale[pixel] = Math.floor(0.299 * r + 0.587 * g + 0.114 * b)
    }

    return calculateDHash(grayscale)
  } catch {
    return null
  }
}

export function dHashDifferencePercent(leftHash: string, rightHash: string): number | null {
  if (leftHash.length === 0 || rightHash.length === 0) return null
  if (leftHash.length !== rightHash.length) return null

  let distance = 0
  for (let i = 0; i < leftHash.length; i++) {
    if (leftHash[i] !== rightHash[i]) distance++
  }
  return (distance / leftHash.length) * 100
}

function calculateDHash(grayscale: Uint8Array): string {
  let hash = ''
  for (let i = 0; i < grayscale.length - 1; i++) {
    hash += grayscale[i] < grayscale[i + 1] ? '1' : '0'
  }
  return hash
}

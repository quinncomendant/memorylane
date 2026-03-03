export function normalizeCustomEndpointModel(model: string | null | undefined): string | null {
  if (typeof model !== 'string') return null
  const normalized = model.trim()
  return normalized.length > 0 ? normalized : null
}

export function getEffectiveSemanticModels(input: {
  isCustomEndpoint: boolean
  customEndpointModel: string | null
  defaultModels: string[]
}): string[] {
  if (input.isCustomEndpoint && input.customEndpointModel) {
    return [input.customEndpointModel]
  }
  return [...input.defaultModels]
}

export function customEndpointVideoUnsupportedCacheKey(input: {
  isCustomEndpoint: boolean
  serverURL: string | null
  model: string | null
}): string | null {
  if (!input.isCustomEndpoint) return null
  if (!input.serverURL || !input.model) return null
  return `${input.serverURL}::${input.model}`
}

export function isLikelyCustomEndpointVideoUnsupportedError(message: string): boolean {
  const text = message.toLowerCase()
  if (text.includes('input_video')) return true
  if (text.includes('invalid message format')) return true

  const hasVideoCue = ['video', 'mp4'].some((cue) => text.includes(cue))
  if (!hasVideoCue) return false

  return [
    'unsupported',
    'not supported',
    'does not support',
    'only image',
    'images only',
    'invalid type',
    'unknown type',
  ].some((cue) => text.includes(cue))
}

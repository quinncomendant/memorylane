import { StoredEvent } from '../processor/storage'

/**
 * Formats a single event as a compact summary line.
 */
export function formatEventLine(event: {
  id: string
  timestamp: number
  appName?: string | null
  summary?: string | null
}): string {
  const timeStr = new Date(event.timestamp).toLocaleString()
  const appInfo = event.appName ? ` [${event.appName}]` : ''
  const summary = event.summary || '(no summary)'
  return `- ${event.id} | ${timeStr}${appInfo} | ${summary}`
}

/**
 * Samples events down to the limit using the chosen strategy.
 */
export function sampleEvents<T>(
  events: T[],
  limit: number,
  sampling: 'uniform' | 'recent_first',
): T[] {
  if (events.length <= limit) return events

  if (sampling === 'recent_first') {
    return events.slice(-limit)
  }

  // Uniform: pick evenly spaced indices across the full range
  const result: T[] = []
  const step = (events.length - 1) / (limit - 1)
  for (let i = 0; i < limit; i++) {
    const idx = Math.round(i * step)
    if (idx < events.length) {
      result.push(events[idx] as T)
    }
  }
  return result
}

/**
 * Merges vector and FTS results, prioritizing vector results.
 */
export function deduplicateResults(
  vectorResults: StoredEvent[],
  ftsResults: StoredEvent[],
): StoredEvent[] {
  const uniqueResults = new Map<string, StoredEvent>()

  vectorResults.forEach((r) => uniqueResults.set(r.id, { ...r, source: 'vector' }))

  ftsResults.forEach((r) => {
    if (!uniqueResults.has(r.id)) {
      uniqueResults.set(r.id, { ...r, source: 'fts' })
    }
  })

  return Array.from(uniqueResults.values())
}

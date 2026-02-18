// eslint-disable-next-line import/no-unresolved
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ActivityProcessor } from '../processor/index'
import { parseTimeString } from './parse-time'
import {
  formatTimelineEntry,
  sampleEntries,
  activityToTimelineEntry,
  TimelineEntry,
} from './formatting'
import log from '../logger'

/**
 * Registers all MCP tools on the given server.
 *
 * @param server - The MCP server instance to register tools on.
 * @param getProcessor - Lazy accessor for the ActivityProcessor (may be null before initialization).
 */
export function registerTools(
  server: McpServer,
  getProcessor: () => ActivityProcessor | null,
): void {
  server.registerTool(
    'search_context',
    {
      description:
        'Semantic search over recorded screen activity sessions. Each result includes id, time, app, and AI summary for summary-first activity reasoning. Use this for targeted questions (e.g. "when did I review PR #142?", "find my work on the auth module"). For exact strings, call get_activity_details to inspect OCR text. If query is omitted, returns activities chronologically (requires startTime or endTime).',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'Semantic search query. When provided, results are ranked by relevance. When omitted, results are returned chronologically (requires at least startTime or endTime).',
          ),
        limit: z.number().optional().describe('Maximum number of results to return (default: 100)'),
        startTime: z
          .string()
          .optional()
          .describe(
            'Filter: only include results after this time. Accepts ISO 8601 (e.g., "2024-01-15T10:00:00") or relative time strings (e.g., "1 hour ago", "yesterday", "2 days ago")',
          ),
        endTime: z
          .string()
          .optional()
          .describe(
            'Filter: only include results before this time. Accepts ISO 8601 (e.g., "2024-01-15T18:00:00") or relative time strings (e.g., "now", "1 hour ago")',
          ),
        appName: z
          .string()
          .optional()
          .describe(
            'Filter: only include results from this application (e.g., "VS Code", "Chrome", "Slack")',
          ),
      },
    },
    (params) => handleSearchContext(getProcessor(), params),
  )

  server.registerTool(
    'browse_timeline',
    {
      description:
        'List activity during a time period — best for broad "what did I do?" questions. Each result is a one-line summary (~20 tokens), so use higher limits (30-50) to get a full picture. Supports uniform sampling to cover long ranges. Returns id, timestamp, app, and summary for activity inference; call get_activity_details only when exact OCR text is needed.',
      inputSchema: {
        startTime: z
          .string()
          .describe(
            'Start of time range. Accepts ISO 8601 (e.g., "2024-01-15T10:00:00") or relative strings (e.g., "1 hour ago", "yesterday", "2 days ago")',
          ),
        endTime: z
          .string()
          .describe(
            'End of time range. Accepts ISO 8601 (e.g., "2024-01-15T18:00:00") or relative strings (e.g., "now", "1 hour ago")',
          ),
        appName: z
          .string()
          .optional()
          .describe(
            'Filter: only include results from this application (e.g., "VS Code", "Chrome", "Slack")',
          ),
        limit: z.number().optional().describe('Maximum number of results to return (default: 100)'),
        sampling: z
          .enum(['uniform', 'recent_first'])
          .optional()
          .describe(
            'How to sample when there are more activities than the limit. "uniform" picks evenly spaced entries across the range (default). "recent_first" returns the newest entries.',
          ),
      },
    },
    (params) => handleBrowseTimeline(getProcessor(), params),
  )

  server.registerTool(
    'get_activity_details',
    {
      description:
        'Fetch full activity details by ID, including summary and raw OCR screen text. This is the only tool that returns OCR content. Use after browse_timeline or search_context when exact on-screen text is required (quotes, file names, error strings), not as the primary source for activity inference.',
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe('Activity IDs to fetch (from search_context or browse_timeline results)'),
      },
    },
    (params) => handleGetActivityDetails(getProcessor(), params),
  )
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleSearchContext(
  processor: ActivityProcessor | null,
  {
    query,
    limit,
    startTime: startTimeStr,
    endTime: endTimeStr,
    appName,
  }: {
    query?: string | undefined
    limit?: number | undefined
    startTime?: string | undefined
    endTime?: string | undefined
    appName?: string | undefined
  },
) {
  if (!processor) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Error: Processor is not initialized. The server cannot search the database.',
        },
      ],
      isError: true,
    }
  }

  try {
    const effectiveLimit = limit ?? 100

    const startTime = startTimeStr ? parseTimeString(startTimeStr) : undefined
    const endTime = endTimeStr ? parseTimeString(endTimeStr) : undefined

    if (startTimeStr && startTime === null) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: Could not parse startTime "${startTimeStr}". Use ISO 8601 format or relative strings like "1 hour ago", "yesterday", etc.`,
          },
        ],
        isError: true,
      }
    }

    if (endTimeStr && endTime === null) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: Could not parse endTime "${endTimeStr}". Use ISO 8601 format or relative strings like "now", "1 hour ago", etc.`,
          },
        ],
        isError: true,
      }
    }

    const storage = processor.getStorageService()

    // No query: fall back to chronological time-range listing
    if (!query) {
      if (startTime === undefined && endTime === undefined) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: Either query or at least one of startTime/endTime is required.',
            },
          ],
          isError: true,
        }
      }

      const activities = await storage.getActivitiesByTimeRange(
        startTime ?? null,
        endTime ?? null,
        { appName },
      )

      const entries = activities.map(activityToTimelineEntry)
      const sampled = sampleEntries(entries, effectiveLimit, 'recent_first')

      if (sampled.length === 0) {
        return {
          content: [
            { type: 'text' as const, text: 'No activities found in the given time range.' },
          ],
        }
      }

      const formatted = sampled.map(formatTimelineEntry).join('\n')

      const header =
        sampled.length < entries.length
          ? `Showing ${sampled.length} of ${entries.length} activities:`
          : `${entries.length} activit${entries.length === 1 ? 'y' : 'ies'}:`

      return {
        content: [{ type: 'text' as const, text: `${header}\n\n${formatted}` }],
      }
    }

    // Semantic search path
    const filters = {
      startTime: startTime ?? undefined,
      endTime: endTime ?? undefined,
      appName,
    }

    // Run embedding generation and FTS in parallel
    const [embedding, ftsResults] = await Promise.all([
      processor.getEmbeddingService().generateEmbedding(query),
      storage.searchActivitiesFTS(query, effectiveLimit, filters).catch((err) => {
        log.warn('FTS search failed, falling back to vector-only:', err)
        return []
      }),
    ])
    const vectorResults = await storage.searchActivitiesVectors(embedding, effectiveLimit, filters)

    // Deduplicate: vector results first (preserves relevance order), then FTS extras
    const seen = new Set<string>()
    const allResults: TimelineEntry[] = []

    for (const a of vectorResults) {
      seen.add(a.id)
      allResults.push(activityToTimelineEntry(a))
    }
    for (const a of ftsResults) {
      if (!seen.has(a.id)) {
        seen.add(a.id)
        allResults.push(activityToTimelineEntry(a))
      }
    }

    // Truncate to requested limit
    const truncated = allResults.slice(0, effectiveLimit)

    if (truncated.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No relevant context found.',
          },
        ],
      }
    }

    const formattedResults = truncated.map(formatTimelineEntry).join('\n')

    return {
      content: [
        {
          type: 'text' as const,
          text: `Found ${truncated.length} relevant results (ranked by relevance):\n\n${formattedResults}`,
        },
      ],
    }
  } catch (error) {
    log.error('Error searching context:', error)
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error performing search: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    }
  }
}

async function handleBrowseTimeline(
  processor: ActivityProcessor | null,
  {
    startTime: startTimeStr,
    endTime: endTimeStr,
    appName,
    limit,
    sampling,
  }: {
    startTime: string
    endTime: string
    appName?: string | undefined
    limit?: number | undefined
    sampling?: 'uniform' | 'recent_first' | undefined
  },
) {
  if (!processor) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Error: Processor is not initialized. The server cannot query the database.',
        },
      ],
      isError: true,
    }
  }

  try {
    const startTime = parseTimeString(startTimeStr)
    const endTime = parseTimeString(endTimeStr)

    if (startTime === null) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: Could not parse startTime "${startTimeStr}". Use ISO 8601 format or relative strings like "1 hour ago", "yesterday", etc.`,
          },
        ],
        isError: true,
      }
    }

    if (endTime === null) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: Could not parse endTime "${endTimeStr}". Use ISO 8601 format or relative strings like "now", "1 hour ago", etc.`,
          },
        ],
        isError: true,
      }
    }

    const storage = processor.getStorageService()
    const activities = await storage.getActivitiesByTimeRange(startTime, endTime, { appName })
    const entries = activities.map(activityToTimelineEntry)

    if (entries.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No activities found in the given time range.',
          },
        ],
      }
    }

    const effectiveLimit = limit ?? 100
    const effectiveSampling = sampling ?? 'uniform'
    const sampled = sampleEntries(entries, effectiveLimit, effectiveSampling)

    const formatted = sampled.map(formatTimelineEntry).join('\n')

    const header =
      sampled.length < entries.length
        ? `Showing ${sampled.length} of ${entries.length} activities (${effectiveSampling} sampling):`
        : `${entries.length} activit${entries.length === 1 ? 'y' : 'ies'}:`

    return {
      content: [
        {
          type: 'text' as const,
          text: `${header}\n\n${formatted}`,
        },
      ],
    }
  } catch (error) {
    log.error('Error browsing timeline:', error)
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error browsing timeline: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    }
  }
}

async function handleGetActivityDetails(
  processor: ActivityProcessor | null,
  { ids }: { ids: string[] },
) {
  if (!processor) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Error: Processor is not initialized. The server cannot query the database.',
        },
      ],
      isError: true,
    }
  }

  try {
    const storage = processor.getStorageService()
    const activities = await storage.getActivitiesByIds(ids)

    if (activities.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No activities found for the given IDs.',
          },
        ],
      }
    }

    const formatted = activities
      .map((a) => {
        const timeStr = new Date(a.startTimestamp).toLocaleString()
        const endTimeStr = new Date(a.endTimestamp).toLocaleString()
        const appInfo = a.appName ? ` [${a.appName}]` : ''
        const summaryLine = a.summary ? `\nSummary: ${a.summary}` : ''
        return `ID: ${a.id}\n[${timeStr} → ${endTimeStr}]${appInfo}${summaryLine}\nOCR: ${a.ocrText}`
      })
      .join('\n\n---\n\n')

    return {
      content: [
        {
          type: 'text' as const,
          text:
            'Interpretation guide: use "Summary" for what the user did. OCR is raw on-screen text for exact recall and can be ambiguous, so do not infer activity from OCR alone.\n\n' +
            `${activities.length} result(s):\n\n${formatted}`,
        },
      ],
    }
  } catch (error) {
    log.error('Error fetching activity details:', error)
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error fetching activity details: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    }
  }
}

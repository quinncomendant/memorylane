/**
 * MemoryLane MCP Server
 *
 * Exposes the context database to AI assistants via the Model Context Protocol.
 * Supports stdio transport for use with Claude Desktop, Cursor, and other MCP clients.
 */

// eslint-disable-next-line import/no-unresolved
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
// eslint-disable-next-line import/no-unresolved
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { Writable } from 'node:stream'
import * as fs from 'fs'
import { EventProcessor } from '../processor/index'
import { StorageService, StoredEvent } from '../processor/storage'
import { EmbeddingService } from '../processor/embedding'
import { getDefaultDbPath } from '../paths'
import log from '../logger'
import { parseTimeString } from './parse-time'

const SERVER_NAME = 'memorylane'
const SERVER_VERSION = '1.0.0'

const SERVER_INSTRUCTIONS = `\
MemoryLane continuously captures screenshots of the user's screen and indexes \
them with OCR text, AI summaries, and app metadata. Use it to recall past \
screen activity.

## Choosing the right tool

- **browse_timeline** — open-ended questions like "what did I do today?", \
"summarize my morning", or "what was I working on last Friday?". Use higher \
limits since each result is a compact one-line summary. \
10-100 is a good default limit for searches over less than 30 minutes. \
100-500 is a good default limit for searches over many hours.
- **search_context** — targeted recall like "when did I review PR #142?", \
"find my work on the auth module", or "that error I saw in the terminal". \
Results are ranked by semantic relevance.
- **get_event_details** — fetch full OCR screen text for specific event IDs \
returned by the other tools. Summaries alone are not enough for detailed \
questions; always call this when the user needs exact content.

## Typical workflows

1. Broad recall: browse_timeline → summarize → get_event_details on key entries
2. Targeted search: search_context → get_event_details on top hits
3. Drill-down: start broad with browse_timeline, then refine with search_context
4. Targeted with time context: start with search_context, then use browse_timeline to get the full context of the time period.

## Tips

- Combine time filters with semantic queries in search_context to narrow results.
- Use the appName filter when the user mentions a specific app ("in VS Code", "on Slack").
- When summarizing a time period, prefer uniform sampling to cover the full range.
- Event IDs are opaque UUIDs — never fabricate them; always use IDs from tool results.`

export class MemoryLaneMCPServer {
  private server: McpServer
  private eventProcessor: EventProcessor | null = null

  constructor(eventProcessor?: EventProcessor) {
    this.eventProcessor = eventProcessor || null
    this.server = new McpServer(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        instructions: SERVER_INSTRUCTIONS,
        capabilities: {
          tools: {},
        },
      },
    )

    this.registerTools()
  }

  /**
   * Registers available MCP tools.
   */
  private registerTools(): void {
    this.server.registerTool(
      'search_context',
      {
        description:
          'Semantic search over recorded screen activity. MemoryLane captures periodic screenshots — each entry has an AI-generated summary, OCR text, app name, and timestamp. Use this for targeted questions (e.g. "when did I review PR #142?", "find my work on the auth module"). Returns compact summaries only (id, time, app, summary) — call get_event_details for full OCR text. If query is omitted, returns events chronologically (requires startTime or endTime).',
        inputSchema: {
          query: z
            .string()
            .optional()
            .describe(
              'Semantic search query. When provided, results are ranked by relevance. When omitted, results are returned chronologically (requires at least startTime or endTime).',
            ),
          limit: z
            .number()
            .optional()
            .describe('Maximum number of results to return (default: 100)'),
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
      this.handleSearchContext.bind(this),
    )

    this.server.registerTool(
      'browse_timeline',
      {
        description:
          'List activity during a time period — best for broad questions like "what did I do today?" Each result is a one-line summary (~20 tokens), so use higher limits (30-50) to get a full picture. Supports uniform sampling to cover long ranges without returning everything. Returns id, timestamp, app, and summary — call get_event_details for full OCR text.',
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
          limit: z
            .number()
            .optional()
            .describe('Maximum number of results to return (default: 100)'),
          sampling: z
            .enum(['uniform', 'recent_first'])
            .optional()
            .describe(
              'How to sample when there are more events than the limit. "uniform" picks evenly spaced entries across the range (default). "recent_first" returns the newest entries.',
            ),
        },
      },
      this.handleBrowseTimeline.bind(this),
    )

    this.server.registerTool(
      'get_event_details',
      {
        description:
          'Fetch full event details by ID, including the raw OCR screen text. This is the only tool that returns OCR content. Use after browse_timeline or search_context to read what was actually on screen.',
        inputSchema: {
          ids: z
            .array(z.string())
            .min(1)
            .max(100)
            .describe('Event IDs to fetch (from search_context or browse_timeline results)'),
        },
      },
      this.handleGetEventDetails.bind(this),
    )
  }

  /**
   * Handler for the search_context tool.
   */
  private async handleSearchContext({
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
  }) {
    if (!this.eventProcessor) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: EventProcessor is not initialized. The server cannot search the database.',
          },
        ],
        isError: true,
      }
    }

    try {
      const effectiveLimit = limit ?? 100

      // Parse time strings
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

        const storage = this.eventProcessor.getStorageService()
        const events = await storage.getEventsByTimeRange(startTime ?? null, endTime ?? null, {
          appName,
        })

        const sampled = this.sampleEvents(events, effectiveLimit, 'recent_first')

        if (sampled.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No events found in the given time range.' }],
          }
        }

        const formatted = sampled
          .map((e) => {
            const timeStr = new Date(e.timestamp as number).toLocaleString()
            const appInfo = e.appName ? ` [${e.appName}]` : ''
            const summary = e.summary || '(no summary)'
            return `- ${e.id} | ${timeStr}${appInfo} | ${summary}`
          })
          .join('\n')

        const header =
          sampled.length < events.length
            ? `Showing ${sampled.length} of ${events.length} events:`
            : `${events.length} event(s):`

        return {
          content: [{ type: 'text' as const, text: `${header}\n\n${formatted}` }],
        }
      }

      // Semantic search path
      const results = await this.eventProcessor.search(query, {
        limit: effectiveLimit,
        startTime: startTime ?? undefined,
        endTime: endTime ?? undefined,
        appName,
      })

      const combinedResults = this.deduplicateResults(results.vector, results.fts)

      if (combinedResults.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No relevant context found.',
            },
          ],
        }
      }

      const formattedResults = this.formatResultsForLLM(combinedResults)

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${combinedResults.length} relevant events:\n\n${formattedResults}`,
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

  /**
   * Handler for the browse_timeline tool.
   */
  private async handleBrowseTimeline({
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
  }) {
    if (!this.eventProcessor) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: EventProcessor is not initialized. The server cannot query the database.',
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

      const storage = this.eventProcessor.getStorageService()
      const allEvents = await storage.getEventsByTimeRange(startTime, endTime, { appName })

      if (allEvents.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No events found in the given time range.',
            },
          ],
        }
      }

      const effectiveLimit = limit ?? 100
      const effectiveSampling = sampling ?? 'uniform'
      const sampled = this.sampleEvents(allEvents, effectiveLimit, effectiveSampling)

      const formatted = sampled
        .map((e) => {
          const timeStr = new Date(e.timestamp as number).toLocaleString()
          const appInfo = e.appName ? ` [${e.appName}]` : ''
          const summary = e.summary || '(no summary)'
          return `- ${e.id} | ${timeStr}${appInfo} | ${summary}`
        })
        .join('\n')

      const header =
        sampled.length < allEvents.length
          ? `Showing ${sampled.length} of ${allEvents.length} events (${effectiveSampling} sampling):`
          : `${allEvents.length} event(s):`

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

  /**
   * Samples events down to the limit using the chosen strategy.
   */
  private sampleEvents<T>(events: T[], limit: number, sampling: 'uniform' | 'recent_first'): T[] {
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
   * Handler for the get_event_details tool.
   */
  private async handleGetEventDetails({ ids }: { ids: string[] }) {
    if (!this.eventProcessor) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: EventProcessor is not initialized. The server cannot query the database.',
          },
        ],
        isError: true,
      }
    }

    try {
      const storage = this.eventProcessor.getStorageService()
      const events = await storage.getEventsByIds(ids)

      if (events.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No events found for the given IDs.',
            },
          ],
        }
      }

      const formatted = events
        .map((e) => {
          const timeStr = new Date(e.timestamp).toLocaleString()
          const appInfo = e.appName ? ` [${e.appName}]` : ''
          const summaryLine = e.summary ? `\nSummary: ${e.summary}` : ''
          return `ID: ${e.id}\n[${timeStr}]${appInfo}${summaryLine}\nOCR: ${e.text}`
        })
        .join('\n\n---\n\n')

      return {
        content: [
          {
            type: 'text' as const,
            text: `${events.length} event(s):\n\n${formatted}`,
          },
        ],
      }
    } catch (error) {
      log.error('Error fetching event details:', error)
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error fetching event details: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      }
    }
  }

  /**
   * Merges vector and FTS results, prioritizing vector results.
   */
  private deduplicateResults(
    vectorResults: StoredEvent[],
    ftsResults: StoredEvent[],
  ): StoredEvent[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uniqueResults = new Map<string, any>()

    // Add vector results first (usually more semantically relevant)
    vectorResults.forEach((r) => uniqueResults.set(r.id, { ...r, source: 'vector' }))

    // Add FTS results if not present
    ftsResults.forEach((r) => {
      if (!uniqueResults.has(r.id)) {
        uniqueResults.set(r.id, { ...r, source: 'fts' })
      }
    })

    return Array.from(uniqueResults.values())
  }

  /**
   * Formats search results as compact summaries (no OCR text).
   * The AI should use get_event_details to fetch full text for specific IDs.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatResultsForLLM(results: any[]): string {
    return results
      .map((r) => {
        const timeStr = new Date(r.timestamp).toLocaleString()
        const appInfo = r.appName ? ` [${r.appName}]` : ''
        const summary = r.summary || '(no summary)'
        return `- ${r.id} | ${timeStr}${appInfo} | ${summary}`
      })
      .join('\n')
  }

  /**
   * Initializes services if they haven't been injected.
   */
  private async initializeServices(dbPath?: string): Promise<void> {
    if (this.eventProcessor) return

    // Use provided path or fall back to default
    const resolvedPath = dbPath || getDefaultDbPath()

    try {
      if (!fs.existsSync(resolvedPath)) {
        // Just a warning, not an error - database might be created on first write
        log.error(`Warning: Database path does not exist: ${resolvedPath}`)
      }

      log.error(`Initializing services with DB path: ${resolvedPath}`)

      const storageService = new StorageService(resolvedPath)
      await storageService.init()

      const embeddingService = new EmbeddingService()
      await embeddingService.init()

      this.eventProcessor = new EventProcessor(embeddingService, storageService)
      log.error('Services initialized successfully')
    } catch (error) {
      log.error('Failed to initialize services:', error)
      // We allow the server to start even if services fail, but tools will report errors
    }
  }

  /**
   * Start the MCP server with stdio transport.
   *
   * @param dbPath - Optional database path override.
   * @param stdout - Optional writable stream for the transport's stdout.
   *                 When provided, the transport writes JSON-RPC to this stream
   *                 instead of process.stdout, allowing the caller to redirect
   *                 process.stdout to stderr so no other module can pollute
   *                 the MCP channel.
   */
  public async start(dbPath?: string, stdout?: Writable): Promise<void> {
    await this.initializeServices(dbPath)

    const transport = new StdioServerTransport(process.stdin, stdout ?? process.stdout)
    await this.server.connect(transport)

    log.error(`${SERVER_NAME} MCP server started`)
  }

  /**
   * Get the underlying McpServer instance for testing or advanced usage.
   */
  public getServer(): McpServer {
    return this.server
  }
}

export default MemoryLaneMCPServer

/**
 * MemoryLane MCP Server
 * 
 * Exposes the context database to AI assistants via the Model Context Protocol.
 * Supports stdio transport for use with Claude Desktop, Cursor, and other MCP clients.
 */

// eslint-disable-next-line import/no-unresolved
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line import/no-unresolved
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import { EventProcessor } from '../processor/index';
import { StorageService, StoredEvent } from '../processor/storage';
import { EmbeddingService } from '../processor/embedding';
import { getDefaultDbPath } from '../paths';

const SERVER_NAME = 'memorylane';
const SERVER_VERSION = '1.0.0';

export class MemoryLaneMCPServer {
  private server: McpServer;
  private eventProcessor: EventProcessor | null = null;

  constructor(eventProcessor?: EventProcessor) {
    this.eventProcessor = eventProcessor || null;
    this.server = new McpServer(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerTools();
  }

  /**
   * Registers available MCP tools.
   */
  private registerTools(): void {
    this.server.registerTool(
      'search_context',
      {
        description: 'Search your personal context vault for relevant information based on what you\'ve been doing on your computer. Uses semantic search to find contextually relevant results. Supports filtering by time range and app name.',
        inputSchema: {
          query: z.string().describe('The search query - describe what context you\'re looking for'),
          limit: z.number().optional().describe('Maximum number of results to return (default: 5)'),
          startTime: z.string().optional().describe('Filter: only include results after this time. Accepts ISO 8601 (e.g., "2024-01-15T10:00:00") or relative time strings (e.g., "1 hour ago", "yesterday", "2 days ago")'),
          endTime: z.string().optional().describe('Filter: only include results before this time. Accepts ISO 8601 (e.g., "2024-01-15T18:00:00") or relative time strings (e.g., "now", "1 hour ago")'),
          appName: z.string().optional().describe('Filter: only include results from this application (e.g., "VS Code", "Chrome", "Slack")'),
        },
      },
      this.handleSearchContext.bind(this)
    );
  }

  /**
   * Parses a time string into a Unix timestamp (ms).
   * Supports ISO 8601 and relative time strings like "now", "today", "yesterday", "X hours/days/minutes ago".
   */
  private parseTimeString(timeStr: string): number | null {
    const trimmed = timeStr.trim().toLowerCase();

    // Handle "now"
    if (trimmed === 'now') {
      return Date.now();
    }

    // Handle "today" (start of today)
    if (trimmed === 'today') {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return now.getTime();
    }

    // Handle "yesterday" (start of yesterday)
    if (trimmed === 'yesterday') {
      const now = new Date();
      now.setDate(now.getDate() - 1);
      now.setHours(0, 0, 0, 0);
      return now.getTime();
    }

    // Handle relative time: "X unit(s) ago"
    const relativeMatch = trimmed.match(/^(\d+)\s*(minute|hour|day|week|month)s?\s*ago$/);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2];
      const now = new Date();

      switch (unit) {
        case 'minute':
          now.setMinutes(now.getMinutes() - amount);
          break;
        case 'hour':
          now.setHours(now.getHours() - amount);
          break;
        case 'day':
          now.setDate(now.getDate() - amount);
          break;
        case 'week':
          now.setDate(now.getDate() - amount * 7);
          break;
        case 'month':
          now.setMonth(now.getMonth() - amount);
          break;
      }
      return now.getTime();
    }

    // Try ISO 8601 parsing
    const isoDate = new Date(timeStr);
    if (!isNaN(isoDate.getTime())) {
      return isoDate.getTime();
    }

    // Could not parse
    return null;
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
    query: string;
    limit?: number;
    startTime?: string;
    endTime?: string;
    appName?: string;
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
      };
    }

    try {
      const effectiveLimit = limit ?? 5;

      // Parse time strings
      const startTime = startTimeStr ? this.parseTimeString(startTimeStr) : undefined;
      const endTime = endTimeStr ? this.parseTimeString(endTimeStr) : undefined;

      // Validate parsed times
      if (startTimeStr && startTime === null) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: Could not parse startTime "${startTimeStr}". Use ISO 8601 format or relative strings like "1 hour ago", "yesterday", etc.`,
            },
          ],
          isError: true,
        };
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
        };
      }

      const results = await this.eventProcessor.search(query, {
        limit: effectiveLimit,
        startTime: startTime ?? undefined,
        endTime: endTime ?? undefined,
        appName,
      });
      
      const combinedResults = this.deduplicateResults(results.vector, results.fts);
      
      if (combinedResults.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No relevant context found.',
            },
          ],
        };
      }

      const formattedResults = this.formatResultsForLLM(combinedResults);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${combinedResults.length} relevant events:\n\n${formattedResults}`,
          },
        ],
      };
    } catch (error) {
      console.error('Error searching context:', error);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error performing search: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Merges vector and FTS results, prioritizing vector results.
   */
  private deduplicateResults(vectorResults: StoredEvent[], ftsResults: StoredEvent[]): StoredEvent[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uniqueResults = new Map<string, any>();
    
    // Add vector results first (usually more semantically relevant)
    vectorResults.forEach(r => uniqueResults.set(r.id, { ...r, source: 'vector' }));
    
    // Add FTS results if not present
    ftsResults.forEach(r => {
      if (!uniqueResults.has(r.id)) {
        uniqueResults.set(r.id, { ...r, source: 'fts' });
      }
    });
    
    return Array.from(uniqueResults.values());
  }

  /**
   * Formats results into a human-readable string for the LLM.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatResultsForLLM(results: any[]): string {
    return results.map(r => {
      const date = new Date(r.timestamp);
      const timeStr = date.toLocaleString();

      // Show app name if available
      const appInfo = r.appName ? ` [${r.appName}]` : '';

      // Show score if available (vector search returns _distance)
      const scoreInfo = r._distance !== undefined
        ? ` (Distance: ${r._distance.toFixed(4)})`
        : '';

      // Show summary if available
      const summaryLine = r.summary ? `\nSummary: ${r.summary}` : '';

      return `[${timeStr}]${appInfo}${scoreInfo}${summaryLine}\nOCR: ${r.text}`;
    }).join('\n\n---\n\n');
  }

  /**
   * Initializes services if they haven't been injected.
   */
  private async initializeServices(dbPath?: string): Promise<void> {
    if (this.eventProcessor) return;

    // Use provided path or fall back to default
    const resolvedPath = dbPath || getDefaultDbPath();

    try {
      if (!fs.existsSync(resolvedPath)) {
        // Just a warning, not an error - database might be created on first write
        console.error(`Warning: Database path does not exist: ${resolvedPath}`);
      }

      console.error(`Initializing services with DB path: ${resolvedPath}`);
      
      const storageService = new StorageService(resolvedPath);
      await storageService.init();

      const embeddingService = new EmbeddingService();
      await embeddingService.init();

      this.eventProcessor = new EventProcessor(embeddingService, storageService);
      console.error('Services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize services:', error);
      // We allow the server to start even if services fail, but tools will report errors
    }
  }

  /**
   * Start the MCP server with stdio transport.
   * This is the main entry point for standalone execution.
   */
  public async start(dbPath?: string): Promise<void> {
    await this.initializeServices(dbPath);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Log to stderr so it doesn't interfere with MCP protocol on stdout
    console.error(`${SERVER_NAME} MCP server started`);
  }

  /**
   * Get the underlying McpServer instance for testing or advanced usage.
   */
  public getServer(): McpServer {
    return this.server;
  }
}

export default MemoryLaneMCPServer;

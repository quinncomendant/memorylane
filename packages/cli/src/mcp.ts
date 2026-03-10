/**
 * Standalone MCP server entry point for the CLI package.
 *
 * Separate entry point (not a subcommand) so the stdout redirect happens
 * at the very top before any module loads — prevents stdout pollution
 * from native addons.
 */

// Capture the real stdout IMMEDIATELY and redirect process.stdout to stderr.
// The MCP stdio protocol owns stdout exclusively.
import { Writable } from 'node:stream'

const realWrite = process.stdout.write.bind(process.stdout)
const mcpStdout = new Writable({
  write(chunk, encoding, callback): void {
    realWrite(chunk, encoding as BufferEncoding, callback)
  },
})
process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write

import { setLogger } from '@main/logger'

const noop = (): void => {}
setLogger({ debug: noop, info: noop })

import * as fs from 'fs'
import { z } from 'zod'
import { MemoryLaneMCPServer } from '@main/mcp/server'
import { getDefaultDbPath } from '@main/paths'
import { resolveDbPath, setDbPath } from './config'

async function main(): Promise<void> {
  const { dbPath } = resolveDbPath(undefined, getDefaultDbPath)

  const server = new MemoryLaneMCPServer()

  // Register CLI-only set_db_path tool
  server.getServer().registerTool(
    'set_db_path',
    {
      description:
        'Set the database path for the MCP server. Persists the path to config and reinitializes the connection.',
      annotations: {
        title: 'Set Database Path',
      },
    },
    {
      dbPath: z.string().describe('Absolute path to the MemoryLane .db file'),
    },
    async ({ dbPath: newDbPath }) => {
      if (!fs.existsSync(newDbPath)) {
        return {
          content: [
            { type: 'text' as const, text: `Error: database file not found at: ${newDbPath}` },
          ],
          isError: true,
        }
      }

      setDbPath(newDbPath)
      await server.reinitializeWithDb(newDbPath)

      return {
        content: [
          {
            type: 'text' as const,
            text: `Database path updated to: ${newDbPath}`,
          },
        ],
      }
    },
  )

  await server.start(dbPath, mcpStdout)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

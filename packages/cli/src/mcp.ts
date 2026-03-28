/**
 * Standalone MCP server entry point for the CLI package.
 *
 * Supports two modes:
 * - stdio (default): for use with Claude Desktop, Cursor, and other MCP clients
 * - HTTP + ngrok (--public [port]): exposes the server via a public URL
 */

// ---------------------------------------------------------------------------
// Parse flags BEFORE any side-effecting code.
// ---------------------------------------------------------------------------
const __argv = process.argv.slice(2)
let __publicPort: number | undefined
let __dbPathArg: string | undefined

for (let i = 0; i < __argv.length; i++) {
  if (__argv[i] === '--public') {
    const next = __argv[i + 1]
    __publicPort = next && !next.startsWith('--') ? parseInt(next, 10) : 3111
    if (isNaN(__publicPort)) __publicPort = 3111
  } else if (__argv[i] === '--db-path' && __argv[i + 1]) {
    __dbPathArg = __argv[++i]
  }
}

const __isPublic = __publicPort !== undefined

// ---------------------------------------------------------------------------
// Stdout capture — only in stdio mode.
// The MCP stdio protocol owns stdout exclusively.
// ---------------------------------------------------------------------------
import { Writable } from 'node:stream'

let mcpStdout: Writable | undefined

if (!__isPublic) {
  const realWrite = process.stdout.write.bind(process.stdout)
  mcpStdout = new Writable({
    write(chunk, encoding, callback): void {
      realWrite(chunk, encoding as BufferEncoding, callback)
    },
  })
  process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import { setLogger } from '@main/logger'

const noop = (): void => {}
setLogger({ debug: noop, info: noop })

import * as crypto from 'node:crypto'
import * as fs from 'fs'
import * as http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { z } from 'zod'
import { MemoryLaneMCPServer } from '@main/mcp/server'
import { StorageService } from '@main/storage'
import { getDefaultDbPath } from '@main/paths'
import { resolveDbPath, setDbPath } from './config'
// eslint-disable-next-line import/no-unresolved
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

// ---------------------------------------------------------------------------
// Stdio mode (original behavior)
// ---------------------------------------------------------------------------
async function mainStdio(): Promise<void> {
  const { dbPath } = resolveDbPath(__dbPathArg, getDefaultDbPath)

  const server = new MemoryLaneMCPServer()

  // Register CLI-only set_db_path tool
  server.getServer().registerTool(
    'set_db_path',
    {
      title: 'Set Database Path',
      description:
        'Set the database path for the MCP server. Persists the path to config and reinitializes the connection.',
      inputSchema: {
        dbPath: z.string().describe('Absolute path to the MemoryLane .db file'),
      },
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

// ---------------------------------------------------------------------------
// HTTP + ngrok mode
// ---------------------------------------------------------------------------
function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

async function pollNgrokUrl(maxAttempts = 20): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const resp = await fetch('http://127.0.0.1:4040/api/tunnels')
      const data = (await resp.json()) as { tunnels?: { proto: string; public_url: string }[] }
      const tunnel = data.tunnels?.find((t) => t.proto === 'https')
      if (tunnel) return tunnel.public_url
    } catch {
      // ngrok not ready yet
    }
  }
  throw new Error('Timed out waiting for ngrok tunnel')
}

async function mainPublic(port: number): Promise<void> {
  const { dbPath } = resolveDbPath(__dbPathArg, getDefaultDbPath)

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at: ${dbPath}`)
    process.exit(1)
  }

  // Generate auth token
  const token = crypto.randomBytes(32).toString('base64url')

  // Initialize shared services once (expensive: loads embedding model)
  console.log('Initializing services...')
  const storage = new StorageService(dbPath)
  const { EmbeddingService } = await import('@main/processor/embedding')
  const embeddingService = new EmbeddingService()
  await embeddingService.init()
  const services = { storage, embeddingService }
  console.log('Services ready.')

  const httpServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Auth check (constant-time comparison to prevent timing attacks)
    const authHeader = req.headers['authorization'] ?? ''
    const expected = `Basic ${token}`
    if (
      authHeader.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      res.writeHead(401)
      res.end('Unauthorized')
      return
    }

    if (req.url !== '/mcp') {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    try {
      // Stateless: new server + transport per request, sharing services
      const server = new MemoryLaneMCPServer(services)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

      res.on('close', () => {
        transport.close().catch(() => {})
      })

      await server.getServer().connect(transport)

      if (req.method === 'POST') {
        const body = await parseBody(req)
        await transport.handleRequest(req, res, body)
      } else {
        await transport.handleRequest(req, res)
      }
    } catch (err) {
      console.error('Request error:', err)
      if (!res.headersSent) {
        res.writeHead(500)
        res.end('Internal server error')
      }
    }
  })

  // Start HTTP server
  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      console.log(`MCP HTTP server listening on http://localhost:${port}/mcp`)
      resolve()
    })
  })

  // Check ngrok is available
  try {
    const { execFileSync } = await import('node:child_process')
    execFileSync('ngrok', ['version'], { stdio: 'ignore' })
  } catch {
    console.error(
      'ngrok is required for --public mode but was not found.\n' +
        'Install it from https://ngrok.com/download and run `ngrok config add-authtoken <token>` to authenticate.',
    )
    httpServer.close()
    storage.close()
    process.exit(1)
  }

  // Spawn ngrok
  let ngrokProcess: ChildProcess | undefined
  try {
    ngrokProcess = spawn('ngrok', ['http', String(port)], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })

    ngrokProcess.on('error', (err) => {
      console.error(`Failed to start ngrok: ${err.message}`)
      process.exit(1)
    })

    ngrokProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`ngrok exited with code ${code}. Is another ngrok tunnel already running?`)
        httpServer.close()
        storage.close()
        process.exit(1)
      }
    })

    const url = await pollNgrokUrl()
    console.log(`\nPublic MCP endpoint: ${url}/mcp`)
    console.log(`Auth token: ${token}`)
    console.log(`Header: Authorization: Basic ${token}\n`)
  } catch (err) {
    console.error('Failed to get ngrok tunnel URL:', err)
    ngrokProcess?.kill()
    httpServer.close()
    storage.close()
    process.exit(1)
  }

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('\nShutting down...')
    ngrokProcess?.kill()
    httpServer.close()
    storage.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const main = __isPublic ? () => mainPublic(__publicPort!) : mainStdio

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

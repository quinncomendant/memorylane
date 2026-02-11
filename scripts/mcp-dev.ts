#!/usr/bin/env npx tsx
/**
 * Toggle Claude Desktop's MCP config between the installed MemoryLane app
 * and the local dev source.
 *
 * Usage:
 *   npm run mcp:dev            # switch to dev
 *   npm run mcp:dev:off        # switch back to installed app
 *   npm run mcp:dev:status     # show current mode
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const CONFIG_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Claude',
  'claude_desktop_config.json',
)

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

const PROD_CONFIG = {
  command: '/Applications/MemoryLane.app/Contents/MacOS/MemoryLane',
  args: ['--mcp'],
  env: { ELECTRON_RUN_AS_NODE: '' },
}

const ELECTRON_BINARY = path.join(
  PROJECT_ROOT,
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'Electron',
)

const DEV_CONFIG = {
  command: '/bin/bash',
  args: [
    '-c',
    `cd ${PROJECT_ROOT} && ELECTRON_RUN_AS_NODE=1 exec ${ELECTRON_BINARY} ./node_modules/.bin/tsx scripts/mcp-server.ts`,
  ],
}

interface ClaudeConfig {
  mcpServers?: Record<string, unknown>
  [key: string]: unknown
}

function readConfig(): ClaudeConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Claude Desktop config not found at:\n  ${CONFIG_PATH}`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as ClaudeConfig
}

function writeConfig(config: ClaudeConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
}

function isDev(config: ClaudeConfig): boolean {
  const ml = config.mcpServers?.['memorylane'] as Record<string, unknown> | undefined
  if (!ml) return false
  return ml.command === '/bin/bash'
}

function status(config: ClaudeConfig): void {
  const ml = config.mcpServers?.['memorylane'] as Record<string, unknown> | undefined
  if (!ml) {
    console.log('memorylane MCP server is not configured in Claude Desktop')
    return
  }
  const mode = isDev(config) ? 'dev' : 'installed app'
  console.log(`memorylane MCP → ${mode}`)
  console.log(`  command: ${ml.command}`)
}

const action = process.argv[2] ?? 'on'

const config = readConfig()

if (action === 'status') {
  status(config)
  process.exit(0)
}

if (!config.mcpServers) {
  config.mcpServers = {}
}

if (action === 'off') {
  config.mcpServers['memorylane'] = PROD_CONFIG
  writeConfig(config)
  console.log('Switched memorylane MCP → installed app')
  console.log('Restart Claude Desktop to apply.')
} else {
  config.mcpServers['memorylane'] = DEV_CONFIG
  writeConfig(config)
  console.log('Switched memorylane MCP → dev')
  console.log(`  source: ${PROJECT_ROOT}`)
  console.log('Restart Claude Desktop to apply.')
}

/**
 * Claude Code MCP integration
 *
 * Reads and updates Claude Code's global settings to register MemoryLane
 * as an MCP server, so users can enable the integration with one click.
 */

import { app, dialog } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import log from '../logger'

interface ClaudeCodeSettings {
  mcpServers?: Record<string, MCPServerEntry>
  [key: string]: unknown
}

interface MCPServerEntry {
  type?: string
  command: string
  args?: string[]
  env?: Record<string, string>
  [key: string]: unknown
}

const MCP_SERVER_KEY = 'memorylane'

/**
 * Returns the path to Claude Code's global settings file (~/.claude/settings.json).
 */
function getClaudeCodeSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

/**
 * Read and parse the Claude Code settings.
 * Returns an empty config object if the file doesn't exist or is invalid.
 */
function readSettings(settingsPath: string): ClaudeCodeSettings {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ClaudeCodeSettings
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Write the settings back to disk, creating the parent directory if needed.
 */
function writeSettings(settingsPath: string, settings: ClaudeCodeSettings): void {
  const dir = path.dirname(settingsPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
}

/**
 * Check whether MemoryLane is already registered in the Claude Code settings.
 */
function isRegistered(settings: ClaudeCodeSettings): boolean {
  return settings.mcpServers !== undefined && MCP_SERVER_KEY in settings.mcpServers
}

/**
 * Build the MCP server entry pointing to the current app executable.
 */
function buildMCPEntry(): MCPServerEntry {
  return {
    type: 'stdio',
    command: app.getPath('exe'),
    args: ['--mcp'],
    env: {},
  }
}

/**
 * Register MemoryLane as an MCP server in Claude Code's global settings.
 *
 * Shows a dialog with the result:
 * - Already registered: informational message
 * - Success: confirmation message
 * - Error: error details
 */
export async function registerWithClaudeCode(): Promise<void> {
  const settingsPath = getClaudeCodeSettingsPath()
  log.info(`[Claude Code Integration] Settings path: ${settingsPath}`)

  try {
    const settings = readSettings(settingsPath)

    if (isRegistered(settings)) {
      log.info('[Claude Code Integration] Already registered')
      await dialog.showMessageBox({
        type: 'info',
        title: 'Already Configured',
        message: 'MemoryLane is already registered in Claude Code',
        detail:
          'The MCP server entry is already present in your Claude Code settings. ' +
          'Restart Claude Code if it is not showing up.',
      })
      return
    }

    if (settings.mcpServers === undefined) {
      settings.mcpServers = {}
    }
    settings.mcpServers[MCP_SERVER_KEY] = buildMCPEntry()

    writeSettings(settingsPath, settings)

    log.info('[Claude Code Integration] Registered successfully')
    await dialog.showMessageBox({
      type: 'info',
      title: 'Added to Claude Code',
      message: 'MemoryLane has been added to Claude Code',
      detail:
        'The MCP server was registered in your global settings. ' +
        'It will be available in all Claude Code sessions.',
    })
  } catch (error) {
    log.error('[Claude Code Integration] Registration failed:', error)
    await dialog.showMessageBox({
      type: 'error',
      title: 'Registration Failed',
      message: 'Could not add MemoryLane to Claude Code',
      detail:
        `An error occurred while updating the Claude Code settings.\n\n` +
        `Settings path: ${settingsPath}\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

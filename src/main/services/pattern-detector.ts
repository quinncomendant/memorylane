/**
 * Pattern detection service.
 *
 * Uses an agentic LLM loop (via OpenRouter) with local database tools to
 * discover recurring automatable patterns in activity history. Includes
 * built-in scheduling: call scheduleRun() on screen unlock and the service
 * handles interval guards, settle delays, and error isolation.
 */

import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'
import { OpenRouter } from '@openrouter/sdk'
import type { StorageService, ActivitySummary } from '../storage'
import type { Pattern, PatternSighting } from '../storage/pattern-repository'
import type { ApiKeyManager } from '../settings/api-key-manager'
import { PATTERN_DETECTION_CONFIG } from '../../shared/constants'
import log from '../logger'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PatternDetectorConfig {
  model: string
  maxIterations: number
  lookbackDays: number
}

export const DEFAULT_DETECTOR_CONFIG: PatternDetectorConfig = {
  model: PATTERN_DETECTION_CONFIG.MODEL,
  maxIterations: 25,
  lookbackDays: PATTERN_DETECTION_CONFIG.LOOKBACK_DAYS,
}

// Deterministic namespace for pattern IDs

const PATTERN_NAMESPACE = uuidv5('memorylane:pattern', uuidv5.DNS)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Finding {
  name: string
  description: string
  apps: string[]
  frequency: string
  automation_idea: string
  confidence: number
  evidence: string
  existing_pattern_id?: string
  activity_ids?: string[]
}

export interface DetectionRunResult {
  runId: string
  newPatterns: number
  updatedPatterns: number
  totalFindings: number
  tokenUsage: { input: number; output: number }
}

export type ProgressCallback = (message: string) => void

// ---------------------------------------------------------------------------
// Tool definitions (sent to the LLM)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_activities',
      description:
        'Get activity summaries within a time range. Returns id, timestamp, duration, app name, and LLM-generated summary.',
      parameters: {
        type: 'object',
        properties: {
          days_back: {
            type: 'number',
            description: 'Number of days back from now. Default 7.',
          },
          app_name: {
            type: 'string',
            description: 'Optional: filter by app name (case-insensitive)',
          },
          limit: {
            type: 'number',
            description:
              'Max results. Default 50. Activities are uniformly sampled if there are more.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_activities',
      description:
        'Full-text search across activity summaries and OCR text. Good for finding specific topics, files, URLs, or concepts.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords' },
          limit: { type: 'number', description: 'Max results. Default 20.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_app_usage_stats',
      description:
        'Aggregate stats: which apps were used, activity count per app, total time, and active hours of day. Good starting point.',
      parameters: {
        type: 'object',
        properties: {
          days_back: { type: 'number', description: 'Days back. Default 7.' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_daily_breakdown',
      description:
        'Activities grouped by date and hour. Shows what happened when — useful for finding time-based patterns and routines.',
      parameters: {
        type: 'object',
        properties: {
          days_back: { type: 'number', description: 'Days back. Default 7.' },
          app_name: { type: 'string', description: 'Optional: filter by app' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_activity_details',
      description:
        'Full details for specific activities by ID, including window titles and TLD. Use to drill into interesting activities.',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Activity IDs to fetch',
          },
        },
        required: ['ids'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_existing_patterns',
      description:
        'Search previously detected patterns by name or description. Use this before reporting a pattern to check if it already exists. If you find a match, include its ID as existing_pattern_id in your output.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search keywords to match against pattern names and descriptions',
          },
        },
        required: ['query'],
      },
    },
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

function uniformSample<T>(arr: T[], maxSize: number): T[] {
  if (arr.length <= maxSize) return arr
  const step = arr.length / maxSize
  const result: T[] = []
  for (let i = 0; i < maxSize; i++) {
    result.push(arr[Math.floor(i * step)])
  }
  return result
}

function formatActivity(a: ActivitySummary) {
  return {
    id: a.id,
    time: new Date(a.startTimestamp).toISOString(),
    duration_min: Math.round((a.endTimestamp - a.startTimestamp) / 60000),
    app: a.appName,
    summary: a.summary,
  }
}

function executeLocalTool(
  storage: StorageService,
  name: string,
  args: Record<string, unknown>,
): unknown {
  const now = Date.now()

  switch (name) {
    case 'get_activities': {
      const daysBack = (args.days_back as number) || 7
      const limit = (args.limit as number) || 50
      const startTime = now - daysBack * 24 * 60 * 60 * 1000
      const activities = storage.activities.getByTimeRange(startTime, now, {
        appName: args.app_name as string | undefined,
      })
      return uniformSample(activities, limit).map(formatActivity)
    }

    case 'search_activities': {
      const query = args.query as string
      if (!query) return { error: 'query parameter is required' }
      const limit = (args.limit as number) || 20
      const results = storage.activities.searchFTS(query, limit)
      return results.map(formatActivity)
    }

    case 'get_app_usage_stats': {
      const daysBack = (args.days_back as number) || 7
      const startTime = now - daysBack * 24 * 60 * 60 * 1000
      const activities = storage.activities.getByTimeRange(startTime, now)

      const stats: Record<
        string,
        { count: number; totalMinutes: number; hours: Set<number>; days: Set<string> }
      > = {}
      for (const a of activities) {
        if (!stats[a.appName]) {
          stats[a.appName] = { count: 0, totalMinutes: 0, hours: new Set(), days: new Set() }
        }
        stats[a.appName].count++
        stats[a.appName].totalMinutes += (a.endTimestamp - a.startTimestamp) / 60000
        stats[a.appName].hours.add(new Date(a.startTimestamp).getHours())
        stats[a.appName].days.add(new Date(a.startTimestamp).toISOString().split('T')[0])
      }

      return Object.entries(stats)
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([app, s]) => ({
          app,
          activity_count: s.count,
          total_minutes: Math.round(s.totalMinutes),
          active_hours: [...s.hours].sort((a, b) => a - b),
          active_days: [...s.days].sort(),
        }))
    }

    case 'get_daily_breakdown': {
      const daysBack = (args.days_back as number) || 7
      const startTime = now - daysBack * 24 * 60 * 60 * 1000
      const activities = storage.activities.getByTimeRange(startTime, now, {
        appName: args.app_name as string | undefined,
      })

      const byDay: Record<string, { app: string; hour: number; summary: string }[]> = {}
      for (const a of activities) {
        const date = new Date(a.startTimestamp)
        const dayKey = date.toISOString().split('T')[0]
        if (!byDay[dayKey]) byDay[dayKey] = []
        byDay[dayKey].push({
          app: a.appName,
          hour: date.getHours(),
          summary: a.summary,
        })
      }

      return Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, entries]) => ({
          date,
          activity_count: entries.length,
          entries: uniformSample(entries, 30),
        }))
    }

    case 'get_activity_details': {
      const ids = args.ids as string[]
      const activities = storage.activities.getByIds(ids)
      return activities.map((a) => ({
        id: a.id,
        time: new Date(a.startTimestamp).toISOString(),
        duration_min: Math.round((a.endTimestamp - a.startTimestamp) / 60000),
        app: a.appName,
        window_title: a.windowTitle,
        tld: a.tld,
        summary: a.summary,
      }))
    }

    case 'search_existing_patterns': {
      const query = args.query as string
      if (!query) return { error: 'query parameter is required' }
      const patterns = storage.patterns.searchPatterns(query)
      return patterns.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        apps: p.apps,
        frequency: p.frequency,
        sighting_count: p.sightingCount,
      }))
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are an automation analyst examining a user's computer activity history. Your job is to find work that is repetitive, manual, and could be automated away with a script, API call, or tool.

You have tools to query the activity database. Use them iteratively — form hypotheses, test them, drill down.

## What you're looking for

GOOD finds (automatable drudge work):
- Periodically checking values/dashboards and copying them into a spreadsheet or table
- Running the same manual steps repeatedly (e.g., benchmark runs, deploy procedures)
- Filling out forms, quotes, invoices with data that could be pulled from another system
- Copy-pasting data between apps (e.g., CRM → spreadsheet, email → ticket system)
- Repetitive lookup workflows (check status in one app, update in another)
- Manual reporting: gathering numbers from multiple sources into a doc/sheet
- Routine maintenance tasks done the same way each time

BAD finds (not useful, skip these):
- "User programs a lot" — obviously, they're a developer
- "User checks email every morning" — that's just life
- "User uses Chrome and VS Code" — that's just app usage, not a workflow
- Generic habits like "browses the web" or "writes code"
- Any pattern that doesn't have a clear automation opportunity

The key question for each finding: "Could a script, cron job, API integration, or macro do this instead of the human?"

## Checking for existing patterns

Before reporting a pattern, use the search_existing_patterns tool to check if it's already known. If you find a match, include its ID in your output as existing_pattern_id. This avoids creating duplicates.

## Approach
1. Start with get_app_usage_stats to understand the landscape
2. Use get_daily_breakdown to look for repetitive manual sequences
3. Search for specific topics like "spreadsheet", "copy", "update", "check", "report", "fill"
4. Drill into suspicious patterns with get_activity_details — window titles and URLs are crucial
5. Look for the SAME sequence of apps/actions happening multiple times across different days
6. Before finalizing, search_existing_patterns to deduplicate

## Output
When done exploring, output your findings as a JSON array:

\`\`\`json
[
  {
    "name": "Short name for the automatable task",
    "description": "What the user does manually, step by step",
    "apps": ["App1", "App2"],
    "frequency": "daily | multiple_times_daily | weekly | occasional",
    "automation_idea": "How this could be automated (specific: which API, what script, what tool)",
    "confidence": 0.0-1.0,
    "evidence": "What data you saw that supports this — be specific about dates, window titles, summaries",
    "existing_pattern_id": "optional — ID of an existing pattern if this is a re-sighting",
    "activity_ids": ["optional — IDs of activities that demonstrate this pattern"]
  }
]
\`\`\`

Be very selective. Only report things where you genuinely see repeated manual work that a computer could do. 2-3 high-quality finds beats 10 vague ones.`
}

// ---------------------------------------------------------------------------
// Finding extraction
// ---------------------------------------------------------------------------

export function extractFindingsFromResponse(content: string): Finding[] {
  const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : content

  try {
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed)) return parsed as Finding[]
    return []
  } catch {
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]) as Finding[]
      } catch {
        return []
      }
    }
    return []
  }
}

// ---------------------------------------------------------------------------
// Pattern ID generation
// ---------------------------------------------------------------------------

function generatePatternId(name: string): string {
  return uuidv5(name.toLowerCase().trim(), PATTERN_NAMESPACE)
}

// ---------------------------------------------------------------------------
// PatternDetector
// ---------------------------------------------------------------------------

export class PatternDetector {
  private running = false
  private settleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly storage: StorageService,
    private readonly apiKeyManager?: ApiKeyManager,
  ) {}

  /**
   * Try to schedule a detection run. Call this on screen unlock / wake.
   * Runs once per day (on the first resume of each calendar day), analyzing
   * the previous day's activities. Guarded by:
   *  - already ran today (based on last sighting timestamp)
   *  - API key availability
   *  - minimum activity count in DB
   * Failures are logged but never propagated.
   */
  scheduleRun(): void {
    if (this.running || this.settleTimer) return

    const apiKey = this.apiKeyManager?.getApiKey()
    if (!apiKey) {
      log.info('[PatternDetector] No API key, skipping')
      return
    }

    const lastRun = this.storage.patterns.getLastRunTimestamp()
    if (lastRun && isSameDay(lastRun, Date.now())) {
      log.info('[PatternDetector] Already ran today, skipping')
      return
    }

    const activityCount = this.storage.activities.count()
    if (activityCount < PATTERN_DETECTION_CONFIG.MIN_ACTIVITIES) {
      log.info(
        `[PatternDetector] Only ${activityCount} activities (need ${PATTERN_DETECTION_CONFIG.MIN_ACTIVITIES}), skipping`,
      )
      return
    }

    log.info(
      `[PatternDetector] Scheduling run in ${PATTERN_DETECTION_CONFIG.SETTLE_DELAY_MS / 1000}s`,
    )
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null
      void this.execute(apiKey)
    }, PATTERN_DETECTION_CONFIG.SETTLE_DELAY_MS)
  }

  /**
   * Run detection immediately. Used by the CLI.
   */
  async run(
    apiKey: string,
    config: Partial<PatternDetectorConfig> = {},
    onProgress?: ProgressCallback,
  ): Promise<DetectionRunResult> {
    return runDetection(apiKey, this.storage, config, onProgress)
  }

  private async execute(apiKey: string): Promise<void> {
    this.running = true
    try {
      const result = await runDetection(apiKey, this.storage)
      log.info(
        `[PatternDetector] Run complete: ${result.totalFindings} findings ` +
          `(${result.newPatterns} new, ${result.updatedPatterns} updated), ` +
          `tokens: ${result.tokenUsage.input}in/${result.tokenUsage.output}out`,
      )
    } catch (error) {
      log.error('[PatternDetector] Run failed:', error)
    } finally {
      this.running = false
    }
  }
}

// ---------------------------------------------------------------------------
// Core agentic loop (stateless)
// ---------------------------------------------------------------------------

async function runDetection(
  apiKey: string,
  storage: StorageService,
  config: Partial<PatternDetectorConfig> = {},
  onProgress?: ProgressCallback,
): Promise<DetectionRunResult> {
  const cfg = { ...DEFAULT_DETECTOR_CONFIG, ...config }
  const runId = uuidv4()
  const now = Date.now()

  const progress = (msg: string) => {
    log.info(`[PatternDetector] ${msg}`)
    onProgress?.(msg)
  }

  progress(`Starting run ${runId} (model=${cfg.model}, lookback=${cfg.lookbackDays}d)`)

  const client = new OpenRouter({ apiKey })

  type Message =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | {
        role: 'assistant'
        content?: string | null
        toolCalls?: {
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }[]
      }
    | { role: 'tool'; content: string; toolCallId: string }

  const timeframe = cfg.lookbackDays === 1 ? 'yesterday' : `the last ${cfg.lookbackDays} days`

  const messages: Message[] = [
    { role: 'system', content: buildSystemPrompt() },
    {
      role: 'user',
      content: `Analyze my activity history from ${timeframe} and find recurring patterns. Start exploring.`,
    },
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let finalContent = ''

  for (let i = 0; i < cfg.maxIterations; i++) {
    progress(`Iteration ${i + 1}/${cfg.maxIterations}`)

    const response = await client.chat.send({
      model: cfg.model,
      messages,
      tools: TOOLS,
      toolChoice: 'auto',
    })

    const choice = response.choices?.[0]
    const msg = choice?.message
    if (!msg) throw new Error('No message in response')

    if (response.usage) {
      totalInputTokens += response.usage.promptTokens || 0
      totalOutputTokens += response.usage.completionTokens || 0
    }

    const content = typeof msg.content === 'string' ? msg.content : null
    messages.push({
      role: 'assistant',
      content,
      toolCalls: msg.toolCalls,
    })

    if (!msg.toolCalls?.length) {
      finalContent = content || ''
      progress(`Completed after ${i + 1} iterations`)
      break
    }

    for (const toolCall of msg.toolCalls) {
      const { name, arguments: argsStr } = toolCall.function
      let args: Record<string, unknown>
      try {
        args = JSON.parse(argsStr)
      } catch {
        args = {}
      }

      progress(`Tool: ${name}(${JSON.stringify(args).substring(0, 100)})`)

      const result = executeLocalTool(storage, name, args)
      const resultStr = JSON.stringify(result, null, 2)

      messages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        content: resultStr,
      })
    }
  }

  if (!finalContent) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    finalContent =
      (lastAssistant && 'content' in lastAssistant ? lastAssistant.content : null) || ''
  }

  // Parse findings and persist
  const findings = extractFindingsFromResponse(finalContent)
  let newPatterns = 0
  let updatedPatterns = 0

  for (const finding of findings) {
    const sightingId = uuidv4()

    if (finding.existing_pattern_id) {
      const existing = storage.patterns.getPatternById(finding.existing_pattern_id)
      if (existing) {
        storage.patterns.addSighting({
          id: sightingId,
          patternId: finding.existing_pattern_id,
          detectedAt: now,
          runId,
          evidence: finding.evidence || '',
          activityIds: finding.activity_ids || [],
          confidence: finding.confidence || 0,
        } satisfies PatternSighting)
        updatedPatterns++
        progress(`Re-sighting of existing pattern: ${existing.name}`)
        continue
      }
    }

    const patternId = generatePatternId(finding.name)
    const pattern: Pattern = {
      id: patternId,
      name: finding.name,
      description: finding.description || '',
      apps: finding.apps || [],
      automationIdea: finding.automation_idea || '',
      frequency: finding.frequency || 'occasional',
      createdAt: now,
      status: 'active',
    }

    storage.patterns.addPattern(pattern)

    storage.patterns.addSighting({
      id: sightingId,
      patternId,
      detectedAt: now,
      runId,
      evidence: finding.evidence || '',
      activityIds: finding.activity_ids || [],
      confidence: finding.confidence || 0,
    } satisfies PatternSighting)

    newPatterns++
    progress(`New pattern: ${finding.name}`)
  }

  const result: DetectionRunResult = {
    runId,
    newPatterns,
    updatedPatterns,
    totalFindings: findings.length,
    tokenUsage: { input: totalInputTokens, output: totalOutputTokens },
  }

  progress(
    `Run complete: ${result.totalFindings} findings (${result.newPatterns} new, ${result.updatedPatterns} updated)`,
  )

  return result
}

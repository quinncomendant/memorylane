// eslint-disable-next-line import/no-unresolved
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/**
 * Registers available MCP prompts.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'recent_activity',
    {
      title: 'Recent Activity',
      description:
        'Summarize what the user has been doing recently. ' +
        'Fetches the latest screen activity and provides a concise overview ' +
        'of recent work, useful as context for follow-up tasks.',
      argsSchema: {
        minutes: z
          .string()
          .optional()
          .describe(
            'How many minutes of recent activity to look back. Defaults to "30". ' +
              'Examples: "15", "30", "60", "120"',
          ),
      },
    },
    ({ minutes }) => {
      const lookback = minutes || '30'
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text:
                `Summarize my recent screen activity from the last ${lookback} minutes.\n\n` +
                'Instructions:\n' +
                `1. Use browse_timeline with startTime "${lookback} minutes ago" and ` +
                'endTime "now", with recent_first sampling and a limit of 50.\n' +
                '2. Call get_event_details on a handful of entries that look most interesting ' +
                'or where the summary alone is ambiguous.\n' +
                '3. Provide a concise narrative summary of what I have been working on, ' +
                'organized by activity or app.\n' +
                '4. Highlight any notable items — e.g. errors, context switches, or ' +
                'repeated focus on a particular task.\n' +
                '5. Keep it brief: a short paragraph or a few bullet points is ideal.',
            },
          },
        ],
      }
    },
  )

  server.registerPrompt(
    'time_report',
    {
      title: 'Time Report',
      description:
        'Generate a time report summarizing screen activity for a given period. ' +
        'Groups work by project/task with approximate durations.',
      argsSchema: {
        period: z
          .string()
          .describe(
            'Time period for the report, in natural language. ' +
              'Examples: "today", "yesterday", "this week", "last Monday", "Feb 3 to Feb 7"',
          ),
      },
    },
    ({ period }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              `Generate a time report for: ${period}\n\n` +
              'Instructions:\n' +
              '1. Use browse_timeline to fetch activity for the period with uniform sampling ' +
              'and a limit of 100-1000.\n' +
              '2. Call get_event_details on entries where more detail might be useful.\n' +
              '3. Group the activity into tasks or projects based on the app and content.\n' +
              '4. Estimate the time spent on each group using the timestamps.\n' +
              '5. Present the report as a table with columns: Time Range, Project/Task, ' +
              'Duration, and Details.\n' +
              '6. Include a total at the bottom.\n' +
              '7. If there are gaps with no recorded activity, note them as breaks.',
          },
        },
      ],
    }),
  )
}

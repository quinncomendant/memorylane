// eslint-disable-next-line import/no-unresolved
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/**
 * Registers available MCP prompts.
 */
export function registerPrompts(server: McpServer): void {
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

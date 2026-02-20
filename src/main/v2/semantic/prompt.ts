import type { InteractionContext } from '../../../shared/types'
import type { V2Activity } from '../activity-types'
import type { SemanticMode } from './types'

export function buildSemanticPrompt(activity: V2Activity, mode: SemanticMode): string {
  const durationMs = Math.max(0, activity.endTimestamp - activity.startTimestamp)
  const sourceNote =
    mode === 'video'
      ? 'Evidence source: one continuous stitched activity video.'
      : 'Evidence source: sampled snapshots from the activity timeline (not continuous coverage).'

  let prompt = 'You are summarizing a user activity session.\n\n'

  prompt += '## Rules\n'
  prompt += '- Answer what the user was working on for later recall.\n'
  prompt += '- Be specific about visible files, pages, or UI context.\n'
  prompt += '- Do not exaggerate certainty.\n'
  prompt += '- Do not mention raw interaction coordinates or low-level event telemetry.\n'
  prompt += '- Keep output to 40-100 words, one paragraph, no bullet points.\n'
  prompt += '- Start directly with the work done, not with meta phrases.\n\n'

  prompt += '## Context\n'
  prompt += `- App: ${activity.context.appName}\n`
  if (activity.context.windowTitle) {
    prompt += `- Window: ${activity.context.windowTitle}\n`
  }
  if (activity.context.tld) {
    prompt += `- TLD: ${activity.context.tld}\n`
  }
  prompt += `- Duration: ${formatDuration(durationMs)}\n`
  prompt += `- Start: ${new Date(activity.startTimestamp).toISOString()}\n`
  prompt += `- End: ${new Date(activity.endTimestamp).toISOString()}\n`
  prompt += `- ${sourceNote}\n\n`

  const timeline = buildInteractionTimeline(activity)
  if (timeline.length > 0) {
    prompt += '## Timeline\n'
    prompt += timeline + '\n\n'
  }

  prompt += '## Task\n'
  prompt +=
    'Describe what the user worked on during this activity based only on visible evidence from the provided media.'

  return prompt
}

function buildInteractionTimeline(activity: V2Activity): string {
  const interactions = [...activity.interactions].sort((a, b) => a.timestamp - b.timestamp)
  if (interactions.length === 0) {
    return '- No interaction events captured.'
  }

  const maxItems = 16
  const items: string[] = []
  for (const interaction of interactions.slice(0, maxItems)) {
    const offsetSeconds = ((interaction.timestamp - activity.startTimestamp) / 1000).toFixed(1)
    items.push(`- t+${offsetSeconds}s: ${describeInteraction(interaction)}`)
  }

  if (interactions.length > maxItems) {
    items.push(`- ... ${interactions.length - maxItems} additional events omitted`)
  }

  return items.join('\n')
}

function describeInteraction(interaction: InteractionContext): string {
  switch (interaction.type) {
    case 'app_change': {
      const processName = interaction.activeWindow?.processName ?? 'unknown app'
      const title = interaction.activeWindow?.title
      return title ? `app switched to ${processName} (${title})` : `app switched to ${processName}`
    }
    case 'keyboard': {
      const keyCount = interaction.keyCount ?? 0
      return keyCount > 0 ? `typing session (${keyCount} keys)` : 'typing session'
    }
    case 'scroll': {
      return 'scrolling activity'
    }
    case 'click': {
      return 'mouse click'
    }
    default:
      return interaction.type
  }
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

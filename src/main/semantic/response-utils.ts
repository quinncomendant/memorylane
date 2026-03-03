import type { ChatResponseLike } from './types'

export function describeSemanticError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function safeJsonStringify(value: unknown): string {
  try {
    return `${JSON.stringify(value, null, 2)}\n`
  } catch (error) {
    return `${JSON.stringify({ error: describeSemanticError(error) }, null, 2)}\n`
  }
}

export function extractSemanticSummary(response: ChatResponseLike): string {
  const content = response.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        const maybeText = (part as { text?: unknown }).text
        return typeof maybeText === 'string' ? maybeText : ''
      })
      .filter((value) => value.length > 0)

    return textParts.join(' ').trim()
  }

  return ''
}

export function extractSemanticUsage(response: ChatResponseLike): {
  promptTokens: number
  completionTokens: number
} {
  const usage = response.usage
  if (!usage) {
    return {
      promptTokens: 0,
      completionTokens: 0,
    }
  }

  const promptTokens = usage.promptTokens ?? usage.prompt_tokens ?? 0
  const completionTokens = usage.completionTokens ?? usage.completion_tokens ?? 0

  return {
    promptTokens,
    completionTokens,
  }
}

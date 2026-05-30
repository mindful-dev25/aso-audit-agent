import { createTextStreamResponse } from 'ai'
import { mastra } from '@/src/mastra'

export const runtime = 'nodejs'
export const maxDuration = 120

function extractApiErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const e = err as Record<string, unknown>
  // AI SDK errors carry the raw provider response in `responseBody`
  if (typeof e.responseBody === 'string') {
    try {
      const body = JSON.parse(e.responseBody) as { error?: { message?: string } }
      if (body.error?.message) return body.error.message
    } catch { /* not JSON */ }
  }
  // Or already parsed in `data`
  if (e.data && typeof e.data === 'object') {
    const data = e.data as { error?: { message?: string } }
    if (data.error?.message) return data.error.message
  }
  return null
}

function formatProviderMessage(raw: string): string {
  const clean = raw.trim()
  return `**API error:** ${clean}`
}

function toUserMessage(err: unknown): string {
  const detailed = extractApiErrorMessage(err)
  if (detailed) return formatProviderMessage(detailed)

  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('rate_limit') || msg.includes('Rate limit')) {
    return '**Rate limit reached.** Please wait about 30–60 seconds and try again.'
  }
  if (msg.includes('Failed to generate JSON')) {
    return '**The model failed to produce a valid structured response.** Please try again.'
  }
  return `**Something went wrong:** ${msg}`
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      'No LLM API key configured. Set ANTHROPIC_API_KEY in your .env.local file.',
      { status: 500, headers: { 'Content-Type': 'text/plain' } },
    )
  }

  const { messages, threadId } = (await req.json()) as { messages: unknown[]; threadId?: string }
  const agent = mastra.getAgent('asoAgent')

  const { readable, writable } = new TransformStream<string, string>()
  const writer = writable.getWriter()

  // Run entirely in the background so the response is returned immediately.
  // All error paths write a readable message and then close the writer so the
  // client always receives an assistant message rather than an abrupt disconnect.
  ;(async () => {
    let bytesWritten = 0

    try {
      const agentResult = await agent.stream(
        messages,
        threadId ? { memory: { thread: threadId } } : {},
      )
      const reader = (agentResult.textStream as unknown as ReadableStream<string>).getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            await writer.write(value)
            bytesWritten += value.length
          }
        }
        // Stream ended with no content — the agent/LLM silently failed.
        if (bytesWritten === 0) {
          await writer.write('The request failed. Please try again in a moment.')
        }
      } catch (streamErr) {
        // Stream errored mid-flight.
        const prefix = bytesWritten > 0 ? '\n\n' : ''
        await writer.write(prefix + toUserMessage(streamErr))
      }
    } catch (agentErr) {
      // agent.stream() itself threw before producing any stream.
      await writer.write(toUserMessage(agentErr))
    }

    try { await writer.close() } catch { /* already closed or client gone */ }
  })()

  return createTextStreamResponse({
    textStream: readable as unknown as ReadableStream<string>,
  })
}

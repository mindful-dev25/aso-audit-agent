import { createTextStreamResponse } from 'ai'
import { mastra } from '@/src/mastra'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return new Response(
      'No LLM API key configured. Set GROQ_API_KEY in your .env.local file.',
      { status: 500, headers: { 'Content-Type': 'text/plain' } },
    )
  }

  const { messages, threadId } = (await req.json()) as { messages: unknown[]; threadId?: string }

  const agent = mastra.getAgent('asoAgent')
  const result = await agent.stream(messages, threadId ? { memory: { thread: threadId } } : {})

  // Mastra uses the Node stream/web ReadableStream — cast to satisfy ai's DOM ReadableStream type.
  return createTextStreamResponse({
    textStream: result.textStream as unknown as ReadableStream<string>,
  })
}

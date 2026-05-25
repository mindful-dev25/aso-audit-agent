import { createTextStreamResponse } from 'ai'
import { mastra } from '@/src/mastra'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return new Response(
      'No LLM API key configured. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) in your .env file.',
      { status: 500, headers: { 'Content-Type': 'text/plain' } },
    )
  }

  const { messages } = (await req.json()) as { messages: unknown[] }

  const agent = mastra.getAgent('asoAgent')
  const result = await agent.stream(messages)

  // Mastra uses the Node stream/web ReadableStream — cast to satisfy ai's DOM ReadableStream type.
  return createTextStreamResponse({
    textStream: result.textStream as unknown as ReadableStream<string>,
  })
}

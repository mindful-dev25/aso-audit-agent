import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'

export const defaultModel = process.env.ANTHROPIC_API_KEY
  ? anthropic('claude-sonnet-4-5')
  : openai('gpt-4o-mini')

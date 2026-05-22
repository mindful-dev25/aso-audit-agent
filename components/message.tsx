'use client'

import type { UIMessage } from 'ai'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AuditCard } from './audit-card'
import type { AuditResult } from '@/src/mastra/workflows/aso-audit-workflow'

function extractText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('')
}

function parseAudit(content: string): AuditResult | null {
  const m = content.match(/```audit-result\n([\s\S]*?)\n```/)
  if (!m) return null
  try {
    return JSON.parse(m[1]) as AuditResult
  } catch {
    return null
  }
}

export function Message({ message }: { message: UIMessage }) {
  const text = extractText(message)
  const isUser = message.role === 'user'

  if (!isUser) {
    const audit = parseAudit(text)
    if (audit) {
      return (
        <div className="w-full">
          <AuditCard audit={audit} />
        </div>
      )
    }
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          isUser
            ? 'max-w-[80%] rounded-2xl bg-secondary px-4 py-2.5 text-sm'
            : 'w-full min-w-0 text-sm leading-relaxed'
        }
      >
        <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
      </div>
    </div>
  )
}

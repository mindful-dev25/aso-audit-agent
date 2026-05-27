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
  const fenceMatch = content.match(/```audit-result\n([\s\S]*?)\n```/)
  const tagMatch = content.match(/<audit-result>([\s\S]*?)<\/audit-result>/)
  const raw = (fenceMatch?.[1] ?? tagMatch?.[1] ?? '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuditResult
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
      const isValid =
        audit.appName &&
        typeof audit.overallScore === 'number' &&
        Array.isArray(audit.dimensions)

      return (
        <div className="w-full">
          {isValid ? (
            <AuditCard audit={audit} />
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Audit completed but the result could not be rendered.
            </div>
          )}
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

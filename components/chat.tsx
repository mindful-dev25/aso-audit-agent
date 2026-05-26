'use client'

import { useChat } from '@ai-sdk/react'
import { TextStreamChatTransport } from 'ai'
import { v4 as uuidv4 } from 'uuid'
import { useRef, useEffect, useState, useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Message } from './message'

export function Chat() {
  const threadId = useMemo(() => {
    const key = 'aso-thread-id'
    const stored = sessionStorage.getItem(key)
    if (stored) return stored
    const id = uuidv4()
    sessionStorage.setItem(key, id)
    return id
  }, [])

  const transport = useMemo(
    () => new TextStreamChatTransport({ api: '/api/chat', body: { threadId } }),
    [threadId],
  )
  const { messages, sendMessage, status, error } = useChat({ transport })
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const isBusy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function submit() {
    const text = input.trim()
    if (!text || isBusy) return
    setInput('')
    sendMessage({ text })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <h1 className="text-2xl font-semibold">ASO Audit Agent</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Paste an Apple App Store URL to get a full optimization audit
              </p>
            </div>
          )}

          {messages.map(m => (
            <Message key={m.id} message={m} />
          ))}

          {error && (
            <div className="flex justify-start px-1">
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                Something went wrong. Please try again.
              </div>
            </div>
          )}

          {status === 'submitted' && (
            <div className="flex justify-start px-1">
              <span className="flex gap-1 text-muted-foreground">
                {[0, 150, 300].map(delay => (
                  <span
                    key={delay}
                    className="animate-bounce text-lg leading-none"
                    style={{ animationDelay: `${delay}ms` }}
                  >
                    ·
                  </span>
                ))}
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t bg-background px-4 py-4">
        <form
          onSubmit={e => { e.preventDefault(); submit() }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Paste an App Store URL or type a message… (Enter to send)"
            className="min-h-[44px] max-h-36 resize-none"
            rows={1}
            disabled={isBusy}
          />
          <Button type="submit" disabled={!input.trim() || isBusy} className="shrink-0">
            Send
          </Button>
        </form>
      </div>
    </div>
  )
}

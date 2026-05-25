'use client'

import { useChat } from '@ai-sdk/react'
import { TextStreamChatTransport } from 'ai'
import { useRef, useEffect, useState, useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Message } from './message'

export function Chat() {
  const transport = useMemo(() => new TextStreamChatTransport({ api: '/api/chat' }), [])
  const { messages, sendMessage, status } = useChat({ transport })
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

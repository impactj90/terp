'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAiAssistantStream } from '@/hooks/use-ai-assistant'
import { ChatMessage } from './chat-message'
import { TypingIndicator } from './typing-indicator'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { X, MessageSquarePlus, Send, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AiAssistantPanelProps {
  open: boolean
  onClose: () => void
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
}

const MIN_WIDTH = 340
const MIN_HEIGHT = 350
const MAX_WIDTH = 700
const MAX_HEIGHT = 800

export function AiAssistantPanel({ open, onClose }: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [mode, setMode] = useState<'kompakt' | 'ausfuehrlich'>('kompakt')
  const [showDisclaimer, setShowDisclaimer] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)

  // Resize state (desktop only)
  const [size, setSize] = useState({ width: 400, height: 500 })
  const isResizing = useRef(false)
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { send, abort, isPending } = useAiAssistantStream()

  const isLoading = isPending || isStreaming

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Auto-focus input when panel opens
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [open])

  // Resize handlers
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isResizing.current = true
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: size.width,
        height: size.height,
      }

      const handleResizeMove = (e: MouseEvent) => {
        if (!isResizing.current) return
        // Panel is anchored bottom-right, so dragging left = wider, dragging up = taller
        const deltaX = resizeStart.current.x - e.clientX
        const deltaY = resizeStart.current.y - e.clientY
        setSize({
          width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeStart.current.width + deltaX)),
          height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resizeStart.current.height + deltaY)),
        })
      }

      const handleResizeEnd = () => {
        isResizing.current = false
        document.removeEventListener('mousemove', handleResizeMove)
        document.removeEventListener('mouseup', handleResizeEnd)
      }

      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', handleResizeEnd)
    },
    [size]
  )

  const handleSend = useCallback(async () => {
    const question = inputValue.trim()
    if (!question || isLoading) return

    const userMessage: Message = { role: 'user', content: question }
    const historyBeforeSend = [...messages]
    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsStreaming(true)

    // Add empty assistant message that we'll stream into
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    await send({
      question,
      mode,
      history: historyBeforeSend,
      onToken: (text) => {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + text,
            }
          }
          return updated
        })
      },
      onDone: () => {
        setIsStreaming(false)
      },
      onError: (error) => {
        setIsStreaming(false)
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant' && !last.content) {
            updated[updated.length - 1] = {
              role: 'assistant',
              content: error,
              isError: true,
            }
          } else if (last && last.role === 'assistant') {
            updated.push({
              role: 'assistant',
              content: error,
              isError: true,
            })
          }
          return updated
        })
      },
    })
  }, [inputValue, messages, mode, isLoading, send])

  const handleNewChat = useCallback(() => {
    abort()
    setMessages([])
    setInputValue('')
    setIsStreaming(false)
    inputRef.current?.focus()
  }, [abort])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  if (!open) return null

  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col rounded-lg border bg-background shadow-lg',
        // Mobile: full width above bottom nav, no custom sizing
        'bottom-[calc(var(--bottom-nav-height)+var(--safe-area-bottom)+4rem)] left-4 right-4 max-h-[70vh]',
        // Desktop: anchored bottom-right, custom size
        'lg:bottom-20 lg:left-auto lg:right-6'
      )}
      style={{
        // Only apply custom size on desktop (CSS handles mobile via left/right)
        width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? size.width : undefined,
        height: typeof window !== 'undefined' && window.innerWidth >= 1024 ? size.height : undefined,
      }}
    >
      {/* Resize handle — top-left corner (desktop only) */}
      <div
        onMouseDown={handleResizeStart}
        className="hidden lg:block absolute -top-1 -left-1 w-4 h-4 cursor-nw-resize z-10"
        title="Größe ändern"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="absolute top-1 left-1 text-muted-foreground/50"
        >
          <path d="M9 1L1 9M6 1L1 6M9 4L4 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Bot className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold flex-1">Terp Assistent</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleNewChat}
              aria-label="Neuer Chat"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Neuer Chat</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              aria-label="Schließen"
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Schließen</TooltipContent>
        </Tooltip>
      </div>

      {/* Disclaimer */}
      {showDisclaimer && (
        <div className="border-b bg-muted/50 px-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Deine Fragen werden zur Beantwortung an die Anthropic API gesendet.
            Gib keine sensiblen oder personenbezogenen Daten in deine Fragen ein.
          </p>
          <Button
            variant="outline"
            size="xs"
            className="mt-1.5"
            onClick={() => setShowDisclaimer(false)}
          >
            Verstanden
          </Button>
        </div>
      )}

      {/* Mode toggle */}
      <div className="border-b px-3 py-2">
        <div className="flex gap-1">
          <Button
            variant={mode === 'kompakt' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setMode('kompakt')}
            className="flex-1"
          >
            Kompakt
          </Button>
          <Button
            variant={mode === 'ausfuehrlich' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setMode('ausfuehrlich')}
            className="flex-1"
          >
            Ausführlich
          </Button>
        </div>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {mode === 'kompakt' ? 'Kurze Antworten' : 'Ausführliche Erklärungen'}
        </p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Stelle eine Frage zum Terp-Handbuch...
          </div>
        )}
        {messages.map((msg, i) =>
          msg.isError ? (
            <div
              key={i}
              className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {msg.content}
            </div>
          ) : (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          )
        )}
        {isPending && !isStreaming && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t px-3 py-2">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Frage eingeben..."
              maxLength={500}
              rows={1}
              className={cn(
                'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'max-h-24 min-h-[36px]'
              )}
              style={{
                height: 'auto',
                minHeight: '36px',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = `${Math.min(target.scrollHeight, 96)}px`
              }}
            />
          </div>
          <Button
            size="icon-sm"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            aria-label="Senden"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-1 text-right text-xs text-muted-foreground">
          {inputValue.length}/500
        </div>
      </div>
    </div>
  )
}

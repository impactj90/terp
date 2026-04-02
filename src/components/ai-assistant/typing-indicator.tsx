'use client'

import { Bot } from 'lucide-react'

/**
 * Animated typing indicator shown when the assistant is generating a response.
 * Three bouncing dots with staggered animation delays.
 */
export function TypingIndicator() {
  return (
    <div className="flex gap-2 mb-3">
      {/* Avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot className="h-4 w-4" />
      </div>

      {/* Dots */}
      <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2">
        <span
          className="inline-block h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: '0ms', animationDuration: '1s' }}
        />
        <span
          className="inline-block h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: '150ms', animationDuration: '1s' }}
        />
        <span
          className="inline-block h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: '300ms', animationDuration: '1s' }}
        />
      </div>
    </div>
  )
}

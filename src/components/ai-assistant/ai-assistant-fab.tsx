'use client'

import { useState } from 'react'
import { AiAssistantPanel } from './ai-assistant-panel'
import { Button } from '@/components/ui/button'
import { Bot, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Floating action button that toggles the AI assistant chat panel.
 * Positioned at the bottom-right corner, above the mobile bottom nav on small screens.
 */
export function AiAssistantFab() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <AiAssistantPanel open={isOpen} onClose={() => setIsOpen(false)} />

      <Button
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'fixed z-50 h-14 w-14 rounded-full shadow-lg',
          // Mobile: above bottom nav
          'bottom-[calc(var(--bottom-nav-height)+var(--safe-area-bottom)+0.5rem)] right-4',
          // Desktop: fixed bottom-right
          'lg:bottom-6 lg:right-6'
        )}
        size="icon-lg"
        aria-label={isOpen ? 'Assistent schließen' : 'Terp Assistent öffnen'}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Bot className="h-6 w-6" />
        )}
      </Button>
    </>
  )
}

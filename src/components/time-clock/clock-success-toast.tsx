'use client'

import { useEffect } from 'react'
import { CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClockSuccessToastProps {
  message: string
  show: boolean
  onHide: () => void
}

export function ClockSuccessToast({ message, show, onHide }: ClockSuccessToastProps) {
  // Auto-hide after 2 seconds
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onHide, 2000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [show, onHide])

  if (!show) return null

  return (
    <div
      className={cn(
        'fixed bottom-20 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-2 px-4 py-2 rounded-lg',
        'bg-success text-success-foreground shadow-lg',
        'animate-in fade-in slide-in-from-bottom-4'
      )}
      role="status"
      aria-live="polite"
    >
      <CheckCircle className="h-4 w-4" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DecisionToastProps {
  message: string
  show: boolean
  variant?: 'success' | 'error'
  onHide: () => void
}

export function DecisionToast({
  message,
  show,
  variant = 'success',
  onHide,
}: DecisionToastProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onHide, 2400)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [show, onHide])

  if (!show) return null

  const Icon = variant === 'error' ? AlertCircle : CheckCircle

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-2 shadow-lg',
        'animate-in fade-in slide-in-from-bottom-4',
        variant === 'error'
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-success text-success-foreground'
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  )
}

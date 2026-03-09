'use client'

import { useState, useEffect } from 'react'
import { useLocale } from 'next-intl'
import { cn } from '@/lib/utils'

interface CurrentTimeProps {
  className?: string
}

export function CurrentTime({ className }: CurrentTimeProps) {
  const locale = useLocale()
  const [time, setTime] = useState<Date | null>(null)

  useEffect(() => {
    // Set initial time on client
    setTime(new Date())

    const interval = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  if (!time) {
    return (
      <div className={cn('text-lg text-muted-foreground', className)}>
        --:--
      </div>
    )
  }

  const timeStr = time.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const dateStr = time.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className={cn('text-center', className)}>
      <div className="text-5xl font-light tabular-nums">{timeStr}</div>
      <div className="mt-1 text-sm text-muted-foreground">{dateStr}</div>
    </div>
  )
}

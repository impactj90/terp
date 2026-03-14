'use client'

import { useState, useEffect } from 'react'
import { formatElapsedTime } from '@/lib/time-utils'
import { cn } from '@/lib/utils'

interface RunningTimerProps {
  /** Start time as Date or ISO string */
  startTime: Date | string | null
  /** Whether the timer is active */
  isRunning: boolean
  /** Optional className */
  className?: string
}

export function RunningTimer({
  startTime,
  isRunning,
  className,
}: RunningTimerProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isRunning || !startTime) {
      setElapsed(0)
      return
    }

    const start =
      typeof startTime === 'string' ? new Date(startTime) : startTime

    // startTime is derived from editedTime (minutes from midnight) so it has
    // minute-level precision. Truncate "now" to the same minute boundary so
    // the timer starts at 0:00 instead of showing residual seconds.
    const startMinute = Math.floor(start.getTime() / 60000) * 60000
    const nowMinute = () => Math.floor(Date.now() / 60000) * 60000

    // Calculate initial elapsed
    setElapsed(nowMinute() - startMinute)

    // Update every second
    const interval = setInterval(() => {
      setElapsed(nowMinute() - startMinute)
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime, isRunning])

  if (!isRunning || !startTime) {
    return (
      <div className={cn('text-4xl font-mono text-muted-foreground', className)}>
        0:00:00
      </div>
    )
  }

  return (
    <div className={cn('text-4xl font-mono tabular-nums', className)}>
      {formatElapsedTime(elapsed)}
    </div>
  )
}

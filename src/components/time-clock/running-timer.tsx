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
    // minute-level precision. Round start to the minute boundary so the timer
    // starts cleanly, but use real Date.now() so seconds tick visibly.
    const startMs = Math.floor(start.getTime() / 60000) * 60000

    // Calculate initial elapsed
    setElapsed(Date.now() - startMs)

    // Update every second
    const interval = setInterval(() => {
      setElapsed(Date.now() - startMs)
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

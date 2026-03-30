'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export interface TimelineSegment {
  startMinutes: number
  endMinutes: number | null
  type: 'work' | 'break'
  label?: string
  hasError?: boolean
}

interface TimelineBarProps {
  segments: TimelineSegment[]
  dayStartMinutes?: number
  dayEndMinutes?: number
  currentTimeMinutes?: number | null
  className?: string
}

function formatTime(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}

export function TimelineBar({
  segments,
  dayStartMinutes = 360,
  dayEndMinutes = 1200,
  currentTimeMinutes,
  className,
}: TimelineBarProps) {
  const { start, end, range } = useMemo(() => {
    let s = dayStartMinutes
    let e = dayEndMinutes
    for (const seg of segments) {
      if (seg.startMinutes < s) s = Math.floor(seg.startMinutes / 60) * 60
      if (seg.endMinutes !== null && seg.endMinutes > e) {
        e = Math.ceil(seg.endMinutes / 60) * 60
      }
    }
    if (currentTimeMinutes !== null && currentTimeMinutes !== undefined) {
      if (currentTimeMinutes > e) e = Math.ceil(currentTimeMinutes / 60) * 60
    }
    return { start: s, end: e, range: e - s }
  }, [segments, dayStartMinutes, dayEndMinutes, currentTimeMinutes])

  const toPercent = (minutes: number) =>
    range > 0 ? ((minutes - start) / range) * 100 : 0

  const hours = useMemo(() => {
    const result: number[] = []
    const firstHour = Math.ceil(start / 60)
    const lastHour = Math.floor(end / 60)
    for (let h = firstHour; h <= lastHour; h++) {
      result.push(h)
    }
    return result
  }, [start, end])

  // Show every other label when there are many hours
  const labelStep = hours.length > 10 ? 2 : 1

  if (segments.length === 0) return null

  return (
    <div className={cn('space-y-1', className)}>
      {/* Track */}
      <div className="relative h-7 rounded-md bg-muted/20 overflow-hidden">
        {segments.map((seg, i) => {
          if (seg.endMinutes === null) {
            // Open-ended segment (missing OUT) — show as thin pulsing bar
            const left = Math.max(0, toPercent(seg.startMinutes))
            return (
              <div
                key={i}
                className="absolute top-1 bottom-1 w-1 rounded-full bg-amber-500 animate-pulse"
                style={{ left: `${left}%` }}
              />
            )
          }

          const left = Math.max(0, toPercent(seg.startMinutes))
          const width = toPercent(seg.endMinutes) - left
          if (width <= 0) return null

          const duration = seg.endMinutes - seg.startMinutes
          const showInlineLabel = width > 8 && seg.type === 'work'

          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'absolute top-1 bottom-1 rounded-[3px] transition-opacity hover:opacity-80 cursor-default',
                    seg.type === 'work'
                      ? seg.hasError
                        ? 'bg-amber-500/60'
                        : 'bg-primary/60'
                      : 'bg-muted-foreground/10',
                  )}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.4)}%`,
                  }}
                >
                  {showInlineLabel && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-primary-foreground/80 truncate px-1">
                      {formatDuration(duration)}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="font-medium">
                  {seg.label ?? (seg.type === 'work' ? 'Arbeit' : 'Pause')}
                </div>
                <div className="text-muted-foreground">
                  {formatTime(seg.startMinutes)}–{formatTime(seg.endMinutes)}
                  {' '}({formatDuration(duration)})
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}

        {/* Now marker */}
        {currentTimeMinutes != null &&
          currentTimeMinutes >= start &&
          currentTimeMinutes <= end && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500/80 z-10 pointer-events-none"
            style={{ left: `${toPercent(currentTimeMinutes)}%` }}
          >
            <div className="absolute -top-0.5 -left-[3px] w-[7px] h-[7px] rounded-full bg-red-500" />
          </div>
        )}
      </div>

      {/* Hour labels */}
      <div className="relative h-3.5">
        {hours.map((h, i) => {
          if (i % labelStep !== 0) return null
          return (
            <span
              key={h}
              className="absolute text-[10px] text-muted-foreground/60 tabular-nums -translate-x-1/2 select-none"
              style={{ left: `${toPercent(h * 60)}%` }}
            >
              {h}
            </span>
          )
        })}
      </div>
    </div>
  )
}

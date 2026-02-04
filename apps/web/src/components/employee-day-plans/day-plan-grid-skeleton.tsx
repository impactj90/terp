'use client'

import { Skeleton } from '@/components/ui/skeleton'

interface DayPlanGridSkeletonProps {
  rows?: number
  columns?: number
}

export function DayPlanGridSkeleton({
  rows = 8,
  columns = 7,
}: DayPlanGridSkeletonProps) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit">
        {/* Header row */}
        <div
          className="grid gap-1 p-2"
          style={{
            gridTemplateColumns: `180px repeat(${columns}, minmax(60px, 1fr))`,
          }}
        >
          {/* Corner cell */}
          <Skeleton className="h-8 w-24" />
          {/* Date headers */}
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>

        {/* Data rows */}
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-1 px-2 py-0.5"
            style={{
              gridTemplateColumns: `180px repeat(${columns}, minmax(60px, 1fr))`,
            }}
          >
            {/* Employee name */}
            <Skeleton className="h-10 w-40" />
            {/* Cells */}
            {Array.from({ length: columns }, (_, colIndex) => (
              <Skeleton key={colIndex} className="h-10" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

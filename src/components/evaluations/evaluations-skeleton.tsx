import { Skeleton } from '@/components/ui/skeleton'

export function EvaluationsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      {/* Shared filters */}
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
      {/* Tab bar */}
      <Skeleton className="h-9 w-[500px]" />
      {/* Table area */}
      <Skeleton className="h-[500px]" />
    </div>
  )
}

import { Skeleton } from '@/components/ui/skeleton'

export function MonthlyValuesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {/* Toolbar area */}
      <div className="grid gap-4 md:grid-cols-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
      {/* Batch actions area */}
      <Skeleton className="h-12" />
      {/* Table area */}
      <Skeleton className="h-[500px]" />
    </div>
  )
}

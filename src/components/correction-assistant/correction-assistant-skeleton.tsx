import { Skeleton } from '@/components/ui/skeleton'

export function CorrectionAssistantSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-72" /> {/* Tab bar */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
      <Skeleton className="h-96" /> {/* Table area */}
    </div>
  )
}

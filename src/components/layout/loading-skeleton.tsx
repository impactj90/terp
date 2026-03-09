'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface LoadingSkeletonProps {
  className?: string
  /** Whether to show sidebar skeleton */
  showSidebar?: boolean
  /** Whether sidebar should appear collapsed */
  sidebarCollapsed?: boolean
}

/**
 * Full layout loading skeleton.
 * Mimics the real layout structure while content loads.
 */
export function LoadingSkeleton({
  className,
  showSidebar = true,
  sidebarCollapsed = false,
}: LoadingSkeletonProps) {
  return (
    <div className={cn('flex min-h-screen bg-background', className)}>
      {/* Sidebar skeleton */}
      {showSidebar && (
        <aside
          className={cn(
            'hidden border-r lg:flex lg:flex-col',
            sidebarCollapsed
              ? 'lg:w-[var(--sidebar-collapsed-width)]'
              : 'lg:w-[var(--sidebar-width)]'
          )}
        >
          {/* Sidebar header */}
          <div className="flex h-[var(--header-height)] items-center border-b px-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              {!sidebarCollapsed && <Skeleton className="h-6 w-20" />}
            </div>
          </div>

          {/* Sidebar nav items */}
          <div className="flex-1 space-y-1 p-3">
            {/* Section title */}
            {!sidebarCollapsed && (
              <Skeleton className="mb-2 h-3 w-16" />
            )}

            {/* Nav items */}
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2',
                  sidebarCollapsed && 'justify-center'
                )}
              >
                <Skeleton className="h-5 w-5" />
                {!sidebarCollapsed && (
                  <Skeleton className="h-4 w-24" />
                )}
              </div>
            ))}

            {/* Section separator */}
            <div className="py-2">
              <Skeleton className="h-px w-full" />
            </div>

            {/* Second section */}
            {!sidebarCollapsed && (
              <Skeleton className="mb-2 h-3 w-20" />
            )}

            {[1, 2, 3].map((i) => (
              <div
                key={`section2-${i}`}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2',
                  sidebarCollapsed && 'justify-center'
                )}
              >
                <Skeleton className="h-5 w-5" />
                {!sidebarCollapsed && (
                  <Skeleton className="h-4 w-20" />
                )}
              </div>
            ))}
          </div>

          {/* Sidebar footer */}
          <div className="border-t p-2">
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2',
                sidebarCollapsed && 'justify-center'
              )}
            >
              <Skeleton className="h-4 w-4" />
              {!sidebarCollapsed && <Skeleton className="h-4 w-16" />}
            </div>
          </div>
        </aside>
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        {/* Header skeleton */}
        <header className="flex h-[var(--header-height)] items-center gap-4 border-b px-4 lg:px-6">
          {/* Mobile menu button */}
          <Skeleton className="h-9 w-9 lg:hidden" />

          {/* Search */}
          <div className="hidden flex-1 md:flex md:max-w-md">
            <Skeleton className="h-9 w-full" />
          </div>

          {/* Spacer */}
          <div className="flex-1 md:hidden" />

          {/* Right side */}
          <div className="flex items-center gap-2">
            <Skeleton className="hidden h-9 w-[180px] md:block" />
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </header>

        {/* Content skeleton */}
        <main className="flex-1 p-4 lg:p-6">
          {/* Breadcrumbs */}
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-1" />
            <Skeleton className="h-4 w-20" />
          </div>

          {/* Page title */}
          <Skeleton className="mb-6 h-8 w-48" />

          {/* Content cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-lg border p-6"
              >
                <Skeleton className="mb-4 h-4 w-24" />
                <Skeleton className="mb-2 h-8 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>

          {/* Content table placeholder */}
          <div className="mt-6 rounded-lg border">
            <div className="border-b p-4">
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

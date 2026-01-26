'use client'

import { useAuth } from '@/providers/auth-provider'
import {
  DashboardHeader,
  TodayScheduleCard,
  HoursThisWeekCard,
  VacationBalanceCard,
  FlextimeBalanceCard,
  QuickActions,
  PendingActions,
  RecentActivity,
} from '@/components/dashboard'
import { Skeleton } from '@/components/ui/skeleton'
import { UserX } from 'lucide-react'

export default function DashboardPage() {
  const { user, isLoading } = useAuth()

  // Get employee_id directly from user (set via /auth/me from database)
  const employeeId = user?.employee_id

  // Show loading state while fetching auth data
  if (isLoading) {
    return <DashboardLoadingSkeleton />
  }

  // Show message if no employee is linked to the user
  if (!employeeId) {
    return (
      <div className="space-y-6">
        <DashboardHeader user={user} />
        <NoEmployeeLinkedMessage />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <DashboardHeader user={user} />

      {/* Quick Actions */}
      <QuickActions employeeId={employeeId} />

      {/* Stats Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <TodayScheduleCard employeeId={employeeId} />
        <HoursThisWeekCard employeeId={employeeId} />
        <VacationBalanceCard employeeId={employeeId} />
        <FlextimeBalanceCard employeeId={employeeId} />
      </div>

      {/* Two column layout for pending + activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PendingActions employeeId={employeeId} />
        <RecentActivity employeeId={employeeId} />
      </div>
    </div>
  )
}

/**
 * Loading skeleton for the entire dashboard.
 */
function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>

      {/* Quick actions skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Cards grid skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </div>
            <Skeleton className="mt-2 h-8 w-20" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Activity sections skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-lg border">
            <div className="border-b px-6 py-4">
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="divide-y">
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex items-start gap-3 px-6 py-3">
                  <Skeleton className="h-4 w-4" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="mt-1 h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Message shown when no employee is linked to the current user.
 */
function NoEmployeeLinkedMessage() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="rounded-full bg-muted p-4">
        <UserX className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">No Employee Profile</h2>
      <p className="mt-2 max-w-md text-center text-muted-foreground">
        Your user account is not linked to an employee record. Please contact
        your administrator to set up your employee profile.
      </p>
      <div className="mt-6 rounded-lg border bg-muted/50 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          <strong>Tip:</strong> Administrators can link your account by matching
          your email address to an employee record or by manually assigning you
          to an employee profile.
        </p>
      </div>
    </div>
  )
}

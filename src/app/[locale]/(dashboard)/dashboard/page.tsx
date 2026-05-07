'use client'

import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
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
import { ProbationDashboardWidget } from '@/components/dashboard/probation-dashboard-widget'
import { UpcomingMaintenancesWidget } from '@/components/dashboard/upcoming-maintenances-widget'
import { PersonnelFileDashboardWidget } from '@/components/hr/personnel-file-dashboard-widget'
import { NkDashboardCard } from '@/components/nachkalkulation/nk-dashboard-card'
import { useModules } from '@/hooks/use-modules'
import { Skeleton } from '@/components/ui/skeleton'
import { UserX } from 'lucide-react'

export default function DashboardPage() {
  const { user, isLoading } = useAuth()
  const { allowed: canViewEmployees, isLoading: permissionLoading } = useHasPermission(['employees.view'])
  const { allowed: canViewSchedules, isLoading: schedPermLoading } = useHasPermission(['service_schedules.view'])
  const { allowed: canViewNk } = useHasPermission(['nachkalkulation.view'])
  const { data: modulesData } = useModules(!isLoading)
  const enabledModules = (modulesData && 'modules' in modulesData ? modulesData.modules : []) as Array<{ module: string }>
  const isNkEnabled = enabledModules.some((m) => m.module === 'nachkalkulation')
  const t = useTranslations('dashboard')

  // Get employee_id directly from user (set via /auth/me from database)
  const employeeId = user?.employeeId

  // Show loading state while fetching auth data
  if (isLoading || permissionLoading || schedPermLoading) {
    return <DashboardLoadingSkeleton />
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Dashboard Header */}
      <DashboardHeader user={user} />

      {employeeId ? (
        <>
          {/* Quick Actions */}
          <QuickActions employeeId={employeeId} />

          {/* Stats Cards Grid — 2 cols on mobile, 4 on desktop */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <TodayScheduleCard employeeId={employeeId} />
            <HoursThisWeekCard employeeId={employeeId} />
            <VacationBalanceCard employeeId={employeeId} />
            <FlextimeBalanceCard employeeId={employeeId} />
          </div>

          {/* Two column layout for pending + activity */}
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <PendingActions employeeId={employeeId} />
            <RecentActivity employeeId={employeeId} />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-muted p-4">
            <UserX className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">{t('noEmployeeProfile')}</h2>
          <p className="mt-2 max-w-md text-center text-muted-foreground">
            {t('noEmployeeDescription')}
          </p>
          <div className="mt-6 rounded-lg border bg-muted/50 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              <strong>{t('tipLabel')}</strong> {t('tipDescription')}
            </p>
          </div>
        </div>
      )}

      {(employeeId || canViewEmployees || canViewSchedules) && (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          {employeeId && <PersonnelFileDashboardWidget />}
          {canViewSchedules && <UpcomingMaintenancesWidget />}
          {canViewEmployees && <ProbationDashboardWidget />}
        </div>
      )}

      {isNkEnabled && canViewNk && (
        <div className="grid gap-4 sm:gap-6">
          <NkDashboardCard days={7} limit={5} />
        </div>
      )}
    </div>
  )
}

/**
 * Loading skeleton for the entire dashboard.
 */
function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-7 w-48 sm:h-8 sm:w-64" />
        <Skeleton className="mt-1.5 h-4 w-32 sm:mt-2 sm:w-48" />
      </div>

      {/* Quick actions skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-11 w-full sm:h-9 sm:w-24" />
        <Skeleton className="h-11 w-full sm:h-9 sm:w-32" />
        <Skeleton className="h-11 w-full sm:h-9 sm:w-28" />
      </div>

      {/* Cards grid skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-16 sm:h-4 sm:w-24" />
              <Skeleton className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <Skeleton className="mt-2 h-6 w-14 sm:h-8 sm:w-20" />
            <Skeleton className="mt-1.5 h-3 w-20 sm:mt-2 sm:w-32" />
          </div>
        ))}
      </div>

      {/* Activity sections skeleton */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-lg border">
            <div className="border-b px-4 py-3 sm:px-6 sm:py-4">
              <Skeleton className="h-5 w-28 sm:h-6 sm:w-32" />
            </div>
            <div className="divide-y">
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex items-start gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
                  <Skeleton className="h-4 w-4" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-36 sm:w-48" />
                    <Skeleton className="mt-1 h-3 w-16 sm:w-20" />
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

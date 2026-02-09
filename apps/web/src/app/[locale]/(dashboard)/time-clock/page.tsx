'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useEmployees } from '@/hooks/api/use-employees'
import { useClockState } from '@/hooks/use-clock-state'
import { useHasPermission } from '@/hooks'
import {
  ClockStatusBadge,
  RunningTimer,
  ClockButton,
  SecondaryActions,
  TodayStats,
  BookingHistory,
  CurrentTime,
  ClockErrorAlert,
  ClockSuccessToast,
} from '@/components/time-clock'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

const ACTION_SUCCESS_KEYS: Record<string, string> = {
  clock_in: 'clockInSuccess',
  clock_out: 'clockOutSuccess',
  start_break: 'breakStarted',
  end_break: 'breakEnded',
  start_errand: 'errandStarted',
  end_errand: 'errandEnded',
}

export default function TimeClockPage() {
  const t = useTranslations('timeClock')
  const tc = useTranslations('common')
  const { user, isLoading: authLoading } = useAuth()
  const { allowed: canViewAll } = useHasPermission(['time_tracking.view_all'])

  const userEmployeeId = user?.employee_id ?? null
  const employees = useEmployees({
    limit: 250,
    active: true,
    enabled: canViewAll,
  })
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Error | null>(null)

  // Set default employee for admin (or use own employee for regular users)
  useEffect(() => {
    if (!canViewAll) {
      if (userEmployeeId && selectedEmployeeId !== userEmployeeId) {
        setSelectedEmployeeId(userEmployeeId)
      }
      return
    }

    if (selectedEmployeeId) return

    if (userEmployeeId) {
      setSelectedEmployeeId(userEmployeeId)
      return
    }

    const firstEmployee = employees.data?.data?.[0]
    if (firstEmployee?.id) {
      setSelectedEmployeeId(firstEmployee.id)
    }
  }, [employees.data, canViewAll, selectedEmployeeId, userEmployeeId])

  const effectiveEmployeeId = canViewAll ? selectedEmployeeId : userEmployeeId

  const clockState = useClockState({
    employeeId: effectiveEmployeeId ?? '',
    enabled: !!effectiveEmployeeId,
  })

  // Wrap handleAction to show success feedback
  const handleActionWithFeedback = useCallback(
    async (action: string) => {
      setActionError(null)
      try {
        await clockState.handleAction(action)
        const key = ACTION_SUCCESS_KEYS[action] ?? 'actionCompleted'
        setSuccessMessage(t(key as Parameters<typeof t>[0]))
      } catch (err) {
        setActionError(err as Error)
      }
    },
    [clockState, t]
  )

  // Loading state
  if (authLoading || (canViewAll && employees.isLoading)) {
    return <TimeClockSkeleton />
  }

  if (!canViewAll && !userEmployeeId) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">{tc('noEmployeeRecord')}</p>
        <p className="text-sm text-muted-foreground">{tc('contactAdmin')}</p>
      </div>
    )
  }

  if (canViewAll && employees.data?.data?.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">{t('noEmployees')}</p>
        <p className="text-sm text-muted-foreground">{t('noEmployeesDescription')}</p>
      </div>
    )
  }

  if (!effectiveEmployeeId) {
    return <TimeClockSkeleton />
  }

  // Fatal error state (can't load day view)
  if (clockState.error && !clockState.bookings.length) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <ClockErrorAlert
          error={clockState.error}
          onRetry={() => clockState.refetch()}
        />
        <Button onClick={() => clockState.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {tc('retry')}
        </Button>
      </div>
    )
  }

  const dailyValue = clockState.dailyValue ?? {
    gross_minutes: 0,
    break_minutes: 0,
    net_minutes: 0,
    target_minutes: 0,
    overtime_minutes: 0,
    undertime_minutes: 0,
  }

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* Show action errors inline */}
      {actionError && (
        <ClockErrorAlert
          error={actionError}
          onRetry={() => setActionError(null)}
        />
      )}

      {/* Employee Selector (temporary until user-employee link exists) */}
      {canViewAll && employees.data?.data && employees.data.data.length > 1 && selectedEmployeeId && (
        <EmployeeSelector
          employees={employees.data.data}
          selectedId={selectedEmployeeId}
          onSelect={setSelectedEmployeeId}
        />
      )}

      {/* Main Clock Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center space-y-6">
            {/* Current Time Display */}
            <CurrentTime />

            {/* Status Badge */}
            <ClockStatusBadge status={clockState.status} />

            {/* Running Timer */}
            <RunningTimer
              startTime={clockState.clockInTime}
              isRunning={clockState.status === 'clocked_in'}
            />

            {/* Main Clock Button */}
            <ClockButton
              status={clockState.status}
              onAction={handleActionWithFeedback}
              isLoading={clockState.isActionLoading}
              disabled={clockState.isLoading}
            />

            {/* Secondary Actions */}
            <SecondaryActions
              status={clockState.status}
              onAction={handleActionWithFeedback}
              isLoading={clockState.isActionLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats and History Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        <TodayStats
          grossMinutes={dailyValue.gross_minutes ?? 0}
          breakMinutes={dailyValue.break_minutes ?? 0}
          netMinutes={dailyValue.net_minutes ?? 0}
          targetMinutes={dailyValue.target_minutes ?? 0}
          overtimeMinutes={dailyValue.overtime_minutes ?? 0}
          undertimeMinutes={dailyValue.undertime_minutes ?? 0}
          isLoading={clockState.isLoading}
        />

        <BookingHistory
          bookings={clockState.bookings}
          isLoading={clockState.isLoading}
        />
      </div>

      {/* Success Toast */}
      <ClockSuccessToast
        message={successMessage ?? ''}
        show={!!successMessage}
        onHide={() => setSuccessMessage(null)}
      />
    </div>
  )
}

function PageHeader() {
  const t = useTranslations('timeClock')
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('subtitle')}
      </p>
    </div>
  )
}

interface EmployeeSelectorProps {
  employees: Array<{ id?: string; first_name?: string; last_name?: string }>
  selectedId: string
  onSelect: (id: string) => void
}

function EmployeeSelector({ employees, selectedId, onSelect }: EmployeeSelectorProps) {
  const t = useTranslations('timeClock')
  const selected = employees.find(e => e.id === selectedId)
  const selectedName = selected
    ? `${selected.first_name} ${selected.last_name}`
    : t('selectEmployee')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          {selectedName}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-full">
        {employees.map((emp) => (
          <DropdownMenuItem
            key={emp.id}
            onClick={() => emp.id && onSelect(emp.id)}
          >
            {emp.first_name} {emp.last_name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TimeClockSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center space-y-6">
            <Skeleton className="h-16 w-32" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-12 w-28" />
            <Skeleton className="h-32 w-32 rounded-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

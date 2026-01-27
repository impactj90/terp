'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AbsenceRequestForm } from '@/components/absences/absence-request-form'
import { AbsenceCalendarView } from '@/components/absences/absence-calendar-view'
import { PendingRequests } from '@/components/absences/pending-requests'
import { VacationBalanceCard } from '@/components/absences/vacation-balance-card'
import type { DateRange } from '@/components/ui/calendar'

export default function AbsencesPage() {
  const t = useTranslations('absences')
  const tc = useTranslations('common')
  const { user, isLoading: authLoading } = useAuth()
  const employeeId = user?.employee_id

  const [formOpen, setFormOpen] = useState(false)
  const [selectedDates, setSelectedDates] = useState<DateRange>()

  const handleCalendarClick = (date: Date) => {
    setSelectedDates({ from: date, to: date })
    setFormOpen(true)
  }

  const handleRequestClick = () => {
    setSelectedDates(undefined)
    setFormOpen(true)
  }

  const handleFormSuccess = () => {
    // Form handles its own refetch via query invalidation
  }

  if (authLoading) {
    return <AbsencesPageSkeleton />
  }

  if (!employeeId) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">
          {tc('noEmployeeRecord')}
        </p>
        <p className="text-sm text-muted-foreground">
          {tc('contactAdmin')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Button onClick={handleRequestClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('requestAbsence')}
        </Button>
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Left column - Balance and Requests */}
        <div className="space-y-6">
          <VacationBalanceCard employeeId={employeeId} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('yourRequests')}</CardTitle>
            </CardHeader>
            <CardContent>
              <PendingRequests employeeId={employeeId} />
            </CardContent>
          </Card>
        </div>

        {/* Right column - Calendar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('calendarOverview')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AbsenceCalendarView
              employeeId={employeeId}
              onDateClick={handleCalendarClick}
            />
          </CardContent>
        </Card>
      </div>

      {/* Request form */}
      <AbsenceRequestForm
        employeeId={employeeId}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={handleFormSuccess}
        initialDates={selectedDates}
      />
    </div>
  )
}

function AbsencesPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Left column */}
        <div className="space-y-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>

        {/* Right column */}
        <Skeleton className="h-96" />
      </div>
    </div>
  )
}

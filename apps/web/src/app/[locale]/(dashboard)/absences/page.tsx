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
import { AbsenceDetailSheet } from '@/components/absences/absence-detail-sheet'
import { AbsenceEditFormSheet } from '@/components/absences/absence-edit-form-sheet'
import { AbsenceCancelDialog } from '@/components/absences/absence-cancel-dialog'
import type { DateRange } from '@/components/ui/calendar'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

export default function AbsencesPage() {
  const t = useTranslations('absences')
  const tc = useTranslations('common')
  const { user, isLoading: authLoading } = useAuth()
  const employeeId = user?.employee_id

  const [formOpen, setFormOpen] = useState(false)
  const [selectedDates, setSelectedDates] = useState<DateRange>()

  // Detail / Edit / Cancel state
  const [selectedAbsence, setSelectedAbsence] = useState<Absence | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

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

  // Detail sheet: clicking an absence card
  const handleAbsenceSelect = (absence: Absence) => {
    setSelectedAbsence(absence)
    setDetailOpen(true)
  }

  // From detail sheet: open edit
  const handleEditFromDetail = (absence: Absence) => {
    setDetailOpen(false)
    setSelectedAbsence(absence)
    setEditOpen(true)
  }

  // From detail sheet: open cancel
  const handleCancelFromDetail = (absence: Absence) => {
    setDetailOpen(false)
    setSelectedAbsence(absence)
    setCancelOpen(true)
  }

  // Direct edit from card icon
  const handleEditClick = (absence: Absence) => {
    setSelectedAbsence(absence)
    setEditOpen(true)
  }

  // Direct cancel from card icon
  const handleCancelClick = (absence: Absence) => {
    setSelectedAbsence(absence)
    setCancelOpen(true)
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
              <PendingRequests
                employeeId={employeeId}
                onSelect={handleAbsenceSelect}
                onEdit={handleEditClick}
                onCancel={handleCancelClick}
              />
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

      {/* Absence detail sheet */}
      <AbsenceDetailSheet
        absence={selectedAbsence}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEditFromDetail}
        onCancel={handleCancelFromDetail}
      />

      {/* Absence edit form sheet */}
      <AbsenceEditFormSheet
        absence={selectedAbsence}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      {/* Absence cancel dialog */}
      <AbsenceCancelDialog
        absence={selectedAbsence}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
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

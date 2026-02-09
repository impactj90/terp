'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useAbsences,
  useApproveAbsence,
  useRejectAbsence,
  useAllDailyValues,
  useApproveDailyValue,
  useTeams,
  useTeamMembers,
} from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AbsenceApprovalTable,
  ApprovalBulkActions,
  ApprovalFilters,
  DecisionToast,
  RejectDialog,
  TimesheetApprovalTable,
} from '@/components/approvals'
import { formatDate } from '@/lib/time-utils'
import type { DateRange } from '@/components/ui/date-range-picker'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

type DailyValue = components['schemas']['DailyValue']

type Team = components['schemas']['Team']

type ToastState = {
  show: boolean
  message: string
  variant: 'success' | 'error'
}

export default function ApprovalsPage() {
  const router = useRouter()
  const t = useTranslations('adminApprovals')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['absences.approve'])

  const [activeTab, setActiveTab] = React.useState<'timesheets' | 'absences'>(
    'timesheets'
  )
  const [teamId, setTeamId] = React.useState<string | null>(null)
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>()
  const [timesheetStatus, setTimesheetStatus] = React.useState('pending')
  const [absenceStatus, setAbsenceStatus] = React.useState('pending')

  const [selectedTimesheetIds, setSelectedTimesheetIds] = React.useState<
    Set<string>
  >(new Set())
  const [selectedAbsenceIds, setSelectedAbsenceIds] = React.useState<Set<string>>(
    new Set()
  )

  const [approvingId, setApprovingId] = React.useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = React.useState<Absence | null>(null)
  const [bulkApprovingTimesheets, setBulkApprovingTimesheets] =
    React.useState(false)
  const [bulkApprovingAbsences, setBulkApprovingAbsences] =
    React.useState(false)
  const [toast, setToast] = React.useState<ToastState>({
    show: false,
    message: '',
    variant: 'success',
  })

  const enabled = !authLoading && !permLoading && canAccess

  const from = dateRange?.from ? formatDate(dateRange.from) : undefined
  const to = dateRange?.to ? formatDate(dateRange.to) : undefined

  const { data: teamsData, isLoading: teamsLoading } = useTeams({
    limit: 100,
    isActive: true,
    enabled,
  })

  const teams = (teamsData?.items ?? []) as Team[]

  const { data: teamMembersData, isLoading: teamMembersLoading } =
    useTeamMembers(teamId ?? '', enabled && !!teamId)

  const teamMemberIds = React.useMemo(() => {
    const ids = new Set<string>()
    const members = teamMembersData?.items ?? []
    for (const member of members) {
      if (member.employee_id) {
        ids.add(member.employee_id)
      }
    }
    return ids
  }, [teamMembersData])

  const isTeamFilterActive = !!teamId
  const isTeamFilterLoading = isTeamFilterActive && teamMembersLoading

  const dailyStatusParam =
    timesheetStatus === 'pending' ? 'calculated' : timesheetStatus

  const { data: dailyValuesData, isLoading: dailyValuesLoading } =
    useAllDailyValues({
      status: dailyStatusParam as
        | 'pending'
        | 'calculated'
        | 'error'
        | 'approved',
      from,
      to,
      enabled,
    })

  const { data: pendingDailyValuesData } = useAllDailyValues({
    status: 'calculated',
    from,
    to,
    enabled,
  })

  const dailyValues = (dailyValuesData?.data ?? []) as DailyValue[]
  const pendingDailyValues =
    (pendingDailyValuesData?.data ?? []) as DailyValue[]

  const filteredDailyValues = React.useMemo(() => {
    if (!isTeamFilterActive) return dailyValues
    if (!teamMembersData) return []
    return dailyValues.filter((dv) => teamMemberIds.has(dv.employee_id))
  }, [dailyValues, isTeamFilterActive, teamMembersData, teamMemberIds])

  const filteredPendingDailyValues = React.useMemo(() => {
    if (!isTeamFilterActive) return pendingDailyValues
    if (!teamMembersData) return []
    return pendingDailyValues.filter((dv) => teamMemberIds.has(dv.employee_id))
  }, [pendingDailyValues, isTeamFilterActive, teamMembersData, teamMemberIds])

  const sortedDailyValues = React.useMemo(() => {
    return [...filteredDailyValues].sort((a, b) =>
      a.value_date.localeCompare(b.value_date)
    )
  }, [filteredDailyValues])

  const { data: absencesData, isLoading: absencesLoading } = useAbsences({
    status: absenceStatus as 'pending' | 'approved' | 'rejected' | 'cancelled',
    from,
    to,
    enabled,
  })

  const { data: pendingAbsencesData } = useAbsences({
    status: 'pending',
    from,
    to,
    enabled,
  })

  const absences = (absencesData?.data ?? []) as Absence[]
  const pendingAbsences = (pendingAbsencesData?.data ?? []) as Absence[]

  const filteredAbsences = React.useMemo(() => {
    if (!isTeamFilterActive) return absences
    if (!teamMembersData) return []
    return absences.filter((absence) =>
      teamMemberIds.has(absence.employee_id)
    )
  }, [absences, isTeamFilterActive, teamMembersData, teamMemberIds])

  const filteredPendingAbsences = React.useMemo(() => {
    if (!isTeamFilterActive) return pendingAbsences
    if (!teamMembersData) return []
    return pendingAbsences.filter((absence) =>
      teamMemberIds.has(absence.employee_id)
    )
  }, [pendingAbsences, isTeamFilterActive, teamMembersData, teamMemberIds])

  const sortedAbsences = React.useMemo(() => {
    return [...filteredAbsences].sort((a, b) =>
      a.absence_date.localeCompare(b.absence_date)
    )
  }, [filteredAbsences])

  const approveAbsence = useApproveAbsence()
  const rejectAbsence = useRejectAbsence()
  const approveDailyValue = useApproveDailyValue()

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const showToast = React.useCallback(
    (message: string, variant: 'success' | 'error' = 'success') => {
      setToast({ show: true, message, variant })
    },
    []
  )

  const handleApproveTimesheet = async (id: string) => {
    setApprovingId(id)
    try {
      await approveDailyValue.mutateAsync({ path: { id } })
      showToast(t('toastTimesheetApproved'))
    } catch {
      showToast(t('toastActionFailed'), 'error')
    } finally {
      setApprovingId(null)
    }
  }

  const handleApproveAbsence = async (id: string) => {
    setApprovingId(id)
    try {
      await approveAbsence.mutateAsync({ path: { id } })
      showToast(t('toastAbsenceApproved'))
    } catch {
      showToast(t('toastActionFailed'), 'error')
    } finally {
      setApprovingId(null)
    }
  }

  const handleRejectClick = (id: string) => {
    const absence = sortedAbsences.find((a) => a.id === id) ?? null
    setRejectTarget(absence)
  }

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return
    try {
      await rejectAbsence.mutateAsync({
        path: { id: rejectTarget.id },
        body: { reason },
      })
      showToast(t('toastAbsenceRejected'))
      setRejectTarget(null)
    } catch {
      showToast(t('toastActionFailed'), 'error')
    }
  }

  const approvableTimesheetIds = React.useMemo(() => {
    return sortedDailyValues
      .filter(
        (dv) =>
          (dv.status === 'calculated' || dv.status === 'pending' || !dv.status) &&
          dv.has_errors !== true
      )
      .map((dv) => dv.id)
  }, [sortedDailyValues])

  const approvableAbsenceIds = React.useMemo(() => {
    return sortedAbsences
      .filter((absence) => absence.status === 'pending')
      .map((absence) => absence.id)
  }, [sortedAbsences])

  React.useEffect(() => {
    const allowed = new Set(approvableTimesheetIds)
    setSelectedTimesheetIds((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (allowed.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      }
      if (!changed && next.size === prev.size) {
        return prev
      }
      return next
    })
  }, [approvableTimesheetIds])

  React.useEffect(() => {
    const allowed = new Set(approvableAbsenceIds)
    setSelectedAbsenceIds((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (allowed.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      }
      if (!changed && next.size === prev.size) {
        return prev
      }
      return next
    })
  }, [approvableAbsenceIds])

  const handleSelectAllTimesheets = () => {
    setSelectedTimesheetIds(new Set(approvableTimesheetIds))
  }

  const handleClearTimesheets = () => {
    setSelectedTimesheetIds(new Set())
  }

  const handleSelectAllAbsences = () => {
    setSelectedAbsenceIds(new Set(approvableAbsenceIds))
  }

  const handleClearAbsences = () => {
    setSelectedAbsenceIds(new Set())
  }

  const handleBulkApproveTimesheets = async () => {
    if (selectedTimesheetIds.size === 0) return
    setBulkApprovingTimesheets(true)
    let approvedCount = 0
    for (const id of selectedTimesheetIds) {
      try {
        await approveDailyValue.mutateAsync({ path: { id } })
        approvedCount += 1
      } catch {
        // Continue bulk approvals
      }
    }
    setBulkApprovingTimesheets(false)
    setSelectedTimesheetIds(new Set())

    if (approvedCount === selectedTimesheetIds.size) {
      showToast(t('toastBulkApproved', { count: approvedCount }))
    } else if (approvedCount > 0) {
      showToast(
        t('toastBulkApprovedPartial', {
          approved: approvedCount,
          total: selectedTimesheetIds.size,
        }),
        'error'
      )
    } else {
      showToast(t('toastActionFailed'), 'error')
    }
  }

  const handleBulkApproveAbsences = async () => {
    if (selectedAbsenceIds.size === 0) return
    setBulkApprovingAbsences(true)
    let approvedCount = 0
    for (const id of selectedAbsenceIds) {
      try {
        await approveAbsence.mutateAsync({ path: { id } })
        approvedCount += 1
      } catch {
        // Continue bulk approvals
      }
    }
    setBulkApprovingAbsences(false)
    setSelectedAbsenceIds(new Set())

    if (approvedCount === selectedAbsenceIds.size) {
      showToast(t('toastBulkApproved', { count: approvedCount }))
    } else if (approvedCount > 0) {
      showToast(
        t('toastBulkApprovedPartial', {
          approved: approvedCount,
          total: selectedAbsenceIds.size,
        }),
        'error'
      )
    } else {
      showToast(t('toastActionFailed'), 'error')
    }
  }

  if (authLoading || permLoading) {
    return <ApprovalsPageSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'timesheets' | 'absences')}>
        <TabsList>
          <TabsTrigger value="timesheets">
            {t('timesheets')}
            {filteredPendingDailyValues.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {filteredPendingDailyValues.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="absences">
            {t('absences')}
            {filteredPendingAbsences.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {filteredPendingAbsences.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timesheets" className="space-y-4">
          <ApprovalFilters
            teams={teams.map((team) => ({ id: team.id, name: team.name }))}
            selectedTeamId={teamId}
            onTeamChange={setTeamId}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            statusOptions={[
              { value: 'pending', label: t('pending') },
              { value: 'approved', label: t('approved') },
              { value: 'error', label: t('error') },
            ]}
            status={timesheetStatus}
            onStatusChange={setTimesheetStatus}
            isLoadingTeams={teamsLoading}
          />

          {timesheetStatus === 'pending' ? (
            <ApprovalBulkActions
              selectedCount={selectedTimesheetIds.size}
              totalCount={approvableTimesheetIds.length}
              isLoading={bulkApprovingTimesheets}
              onSelectAll={handleSelectAllTimesheets}
              onClearSelection={handleClearTimesheets}
              onBulkApprove={handleBulkApproveTimesheets}
              disabled={bulkApprovingTimesheets}
            />
          ) : null}

          <Card>
            <CardContent className="p-0">
              <TimesheetApprovalTable
                dailyValues={sortedDailyValues}
                isLoading={dailyValuesLoading || isTeamFilterLoading}
                selectedIds={selectedTimesheetIds}
                onToggleSelect={(id) =>
                  setSelectedTimesheetIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) {
                      next.delete(id)
                    } else {
                      next.add(id)
                    }
                    return next
                  })
                }
                onApprove={handleApproveTimesheet}
                approvingId={approvingId}
                showHistory={timesheetStatus !== 'pending'}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="absences" className="space-y-4">
          <ApprovalFilters
            teams={teams.map((team) => ({ id: team.id, name: team.name }))}
            selectedTeamId={teamId}
            onTeamChange={setTeamId}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            statusOptions={[
              { value: 'pending', label: t('pending') },
              { value: 'approved', label: t('approved') },
              { value: 'rejected', label: t('rejected') },
              { value: 'cancelled', label: t('cancelled') },
            ]}
            status={absenceStatus}
            onStatusChange={setAbsenceStatus}
            isLoadingTeams={teamsLoading}
          />

          {absenceStatus === 'pending' ? (
            <ApprovalBulkActions
              selectedCount={selectedAbsenceIds.size}
              totalCount={approvableAbsenceIds.length}
              isLoading={bulkApprovingAbsences}
              onSelectAll={handleSelectAllAbsences}
              onClearSelection={handleClearAbsences}
              onBulkApprove={handleBulkApproveAbsences}
              disabled={bulkApprovingAbsences}
            />
          ) : null}

          <Card>
            <CardContent className="p-0">
              <AbsenceApprovalTable
                absences={sortedAbsences}
                isLoading={absencesLoading || isTeamFilterLoading}
                onApprove={handleApproveAbsence}
                onReject={handleRejectClick}
                approvingId={approvingId}
                rejectingId={rejectAbsence.isPending ? rejectTarget?.id : null}
                selectedIds={selectedAbsenceIds}
                onToggleSelect={(id) =>
                  setSelectedAbsenceIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) {
                      next.delete(id)
                    } else {
                      next.add(id)
                    }
                    return next
                  })
                }
                showHistory={absenceStatus !== 'pending'}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RejectDialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
        title={t('rejectTitle')}
        description={
          rejectTarget
            ? t('rejectDescription', {
                name: `${rejectTarget.employee?.first_name ?? ''} ${rejectTarget.employee?.last_name ?? ''}`.trim(),
                date: rejectTarget.absence_date ?? '',
              })
            : ''
        }
        isLoading={rejectAbsence.isPending}
        onConfirm={handleRejectConfirm}
      />

      <DecisionToast
        message={toast.message}
        show={toast.show}
        variant={toast.variant}
        onHide={() => setToast((prev) => ({ ...prev, show: false }))}
      />
    </div>
  )
}

function ApprovalsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96" />
      </div>
    </div>
  )
}

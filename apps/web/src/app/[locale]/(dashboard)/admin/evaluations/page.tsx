'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useDepartments, useEmployees } from '@/hooks/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  EvaluationsSkeleton,
  EvaluationsSharedFilters,
  DailyValuesTab,
  BookingsTab,
  TerminalBookingsTab,
  LogsTab,
  WorkflowHistoryTab,
} from '@/components/evaluations'
import { EvaluationDetailSheet } from '@/components/evaluations/evaluation-detail-sheet'
import { formatDate } from '@/lib/time-utils'
import type { DateRange } from '@/components/ui/date-range-picker'
import type { components } from '@/lib/api/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

type EvaluationTab = 'daily-values' | 'bookings' | 'terminal-bookings' | 'logs' | 'workflow-history'
type DetailEntry =
  | { type: 'log'; entry: components['schemas']['EvaluationLogEntry'] }
  | { type: 'workflow'; entry: components['schemas']['EvaluationWorkflowEntry'] }

export default function EvaluationsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('evaluations')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['reports.view'])

  // Read initial state from URL
  const initialTab = (searchParams.get('tab') as EvaluationTab) || 'daily-values'
  const initialFrom = searchParams.get('from')
  const initialTo = searchParams.get('to')
  const initialEmployeeId = searchParams.get('employee_id')
  const initialDepartmentId = searchParams.get('department_id')

  // Shared filter state
  const [activeTab, setActiveTab] = React.useState<EvaluationTab>(initialTab)
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => {
    if (initialFrom && initialTo) {
      return {
        from: new Date(initialFrom + 'T00:00:00'),
        to: new Date(initialTo + 'T00:00:00'),
      }
    }
    // Default to current month
    const now = new Date()
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    }
  })
  const [employeeId, setEmployeeId] = React.useState<string | null>(initialEmployeeId)
  const [departmentId, setDepartmentId] = React.useState<string | null>(initialDepartmentId)

  // Detail sheet state
  const [detailEntry, setDetailEntry] = React.useState<DetailEntry | null>(null)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  // Sync state to URL - use a ref to avoid infinite loops from searchParams dependency
  const stateRef = React.useRef({ activeTab, dateRange, employeeId, departmentId })
  stateRef.current = { activeTab, dateRange, employeeId, departmentId }

  const syncToUrl = React.useCallback(
    (overrides: Partial<typeof stateRef.current> = {}) => {
      const state = { ...stateRef.current, ...overrides }
      const params = new URLSearchParams()
      params.set('tab', state.activeTab)
      const fromStr = state.dateRange?.from ? formatDate(state.dateRange.from) : null
      const toStr = state.dateRange?.to ? formatDate(state.dateRange.to) : null
      if (fromStr) params.set('from', fromStr)
      if (toStr) params.set('to', toStr)
      if (state.employeeId) params.set('employee_id', state.employeeId)
      if (state.departmentId) params.set('department_id', state.departmentId)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname]
  )

  const enabled = !authLoading && !permLoading && canAccess

  // Departments and employees for filter dropdowns
  const { data: departmentsData, isLoading: departmentsLoading } = useDepartments({ enabled })
  const departments = (departmentsData?.data ?? []).map((d: { id: string; name: string }) => ({
    id: d.id,
    name: d.name,
  }))

  const { data: employeesData, isLoading: employeesLoading } = useEmployees({ limit: 500, enabled })
  const employees = (employeesData?.data ?? []).map(
    (e: { id: string; first_name: string; last_name: string }) => ({
      id: e.id,
      name: `${e.first_name} ${e.last_name}`,
    })
  )

  // Computed values for API calls
  const from = dateRange?.from ? formatDate(dateRange.from) : undefined
  const to = dateRange?.to ? formatDate(dateRange.to) : undefined

  // Check large date range (> 90 days)
  const isLargeDateRange = React.useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return false
    const diff = dateRange.to.getTime() - dateRange.from.getTime()
    const days = diff / (1000 * 60 * 60 * 24)
    return days > 90
  }, [dateRange])

  // Wrapped state setters that also sync to URL
  const handleDateRangeChange = React.useCallback(
    (range: DateRange | undefined) => {
      setDateRange(range)
      syncToUrl({ dateRange: range })
    },
    [syncToUrl]
  )

  const handleEmployeeChange = React.useCallback(
    (id: string | null) => {
      setEmployeeId(id)
      syncToUrl({ employeeId: id })
    },
    [syncToUrl]
  )

  const handleDepartmentChange = React.useCallback(
    (id: string | null) => {
      setDepartmentId(id)
      syncToUrl({ departmentId: id })
    },
    [syncToUrl]
  )

  const handleTabChange = React.useCallback(
    (value: string) => {
      const tab = value as EvaluationTab
      setActiveTab(tab)
      syncToUrl({ activeTab: tab })
    },
    [syncToUrl]
  )

  // Clear shared filters
  const clearFilters = React.useCallback(() => {
    const now = new Date()
    const range = {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    }
    setDateRange(range)
    setEmployeeId(null)
    setDepartmentId(null)
    syncToUrl({ dateRange: range, employeeId: null, departmentId: null })
  }, [syncToUrl])

  const hasFilters = !!(employeeId || departmentId)

  if (authLoading || permLoading) {
    return <EvaluationsSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>
        <p className="text-muted-foreground">{t('page.subtitle')}</p>
      </div>

      {/* Shared filters */}
      <EvaluationsSharedFilters
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        employeeId={employeeId}
        onEmployeeChange={handleEmployeeChange}
        departmentId={departmentId}
        onDepartmentChange={handleDepartmentChange}
        employees={employees}
        departments={departments}
        isLoadingEmployees={employeesLoading}
        isLoadingDepartments={departmentsLoading}
        onClearFilters={clearFilters}
        hasFilters={hasFilters}
      />

      {/* Large date range warning */}
      {isLargeDateRange && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t('warnings.largeDateRange')}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
      >
        <TabsList>
          <TabsTrigger value="daily-values">{t('tabs.dailyValues')}</TabsTrigger>
          <TabsTrigger value="bookings">{t('tabs.bookings')}</TabsTrigger>
          <TabsTrigger value="terminal-bookings">{t('tabs.terminalBookings')}</TabsTrigger>
          <TabsTrigger value="logs">{t('tabs.logs')}</TabsTrigger>
          <TabsTrigger value="workflow-history">{t('tabs.workflowHistory')}</TabsTrigger>
        </TabsList>

        <TabsContent value="daily-values" className="space-y-4">
          <DailyValuesTab
            from={from}
            to={to}
            employeeId={employeeId ?? undefined}
            departmentId={departmentId ?? undefined}
          />
        </TabsContent>

        <TabsContent value="bookings" className="space-y-4">
          <BookingsTab
            from={from}
            to={to}
            employeeId={employeeId ?? undefined}
            departmentId={departmentId ?? undefined}
          />
        </TabsContent>

        <TabsContent value="terminal-bookings" className="space-y-4">
          <TerminalBookingsTab
            from={from}
            to={to}
            employeeId={employeeId ?? undefined}
            departmentId={departmentId ?? undefined}
          />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <LogsTab
            from={from}
            to={to}
            employeeId={employeeId ?? undefined}
            departmentId={departmentId ?? undefined}
            onViewDetail={(entry) => setDetailEntry({ type: 'log', entry })}
          />
        </TabsContent>

        <TabsContent value="workflow-history" className="space-y-4">
          <WorkflowHistoryTab
            from={from}
            to={to}
            employeeId={employeeId ?? undefined}
            departmentId={departmentId ?? undefined}
            onViewDetail={(entry) => setDetailEntry({ type: 'workflow', entry })}
          />
        </TabsContent>
      </Tabs>

      {/* Detail sheet for logs and workflow entries */}
      <EvaluationDetailSheet
        entry={detailEntry}
        open={!!detailEntry}
        onOpenChange={(open) => {
          if (!open) setDetailEntry(null)
        }}
      />
    </div>
  )
}

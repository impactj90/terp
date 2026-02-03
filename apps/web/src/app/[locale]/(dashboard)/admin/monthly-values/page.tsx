'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useAdminMonthlyValues,
  useEmployees,
  useDepartments,
} from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import {
  MonthlyValuesDataTable,
  MonthlyValuesToolbar,
  MonthlyValuesBatchActions,
  MonthlyValuesDetailSheet,
  BatchCloseDialog,
  BatchReopenDialog,
  RecalculateDialog,
  MonthlyValuesSkeleton,
} from '@/components/monthly-values'
import type { MonthlyValueRow } from '@/components/monthly-values/monthly-values-data-table'

export default function MonthlyValuesPage() {
  const router = useRouter()
  const t = useTranslations('monthlyValues')
  const locale = useLocale()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters
  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [month, setMonth] = React.useState(() => new Date().getMonth() + 1)
  const [departmentId, setDepartmentId] = React.useState<string | null>(null)
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [search, setSearch] = React.useState('')

  // Selection
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  // Detail sheet
  const [selectedItem, setSelectedItem] = React.useState<MonthlyValueRow | null>(null)

  // Dialogs
  const [batchCloseOpen, setBatchCloseOpen] = React.useState(false)
  const [batchReopenOpen, setBatchReopenOpen] = React.useState(false)
  const [recalculateOpen, setRecalculateOpen] = React.useState(false)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  // Clear selection when filters change
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [year, month, departmentId, statusFilter])

  const enabled = !authLoading && isAdmin

  // Monthly values
  const { data: mvData, isLoading: mvLoading } = useAdminMonthlyValues({
    year,
    month,
    departmentId: departmentId ?? undefined,
    status: statusFilter !== 'all' ? (statusFilter as 'open' | 'calculated' | 'closed' | 'exported') : undefined,
    enabled,
  })

  // Employees (for frontend join - fetch all with high limit)
  const { data: employeesData } = useEmployees({ limit: 1000, enabled })

  // Departments (for filter dropdown)
  const { data: departmentsData, isLoading: departmentsLoading } = useDepartments({ enabled })
  const departments = (departmentsData?.data ?? []).map((d: { id: string; name: string }) => ({
    id: d.id,
    name: d.name,
  }))

  // Frontend join: enrich monthly values with employee names
  const enrichedRows: MonthlyValueRow[] = React.useMemo(() => {
    const monthlyValues = mvData?.data ?? []
    const employees = employeesData?.data ?? []

    // Build employee lookup map
    const employeeMap = new Map<
      string,
      { first_name: string; last_name: string; personnel_number: string }
    >()
    for (const emp of employees) {
      employeeMap.set(emp.id, {
        first_name: emp.first_name ?? '',
        last_name: emp.last_name ?? '',
        personnel_number: emp.personnel_number ?? '',
      })
    }

    return monthlyValues.map((mv) => {
      const emp = employeeMap.get(mv.employee_id ?? '')
      return {
        id: mv.id ?? '',
        employee_id: mv.employee_id ?? '',
        employee_name: emp
          ? `${emp.last_name}, ${emp.first_name}`
          : (mv.employee_id ?? ''),
        personnel_number: emp?.personnel_number ?? '',
        year: mv.year ?? year,
        month: mv.month ?? month,
        status: (mv.status ?? 'open') as MonthlyValueRow['status'],
        target_minutes: mv.target_minutes ?? 0,
        net_minutes: mv.net_minutes ?? 0,
        overtime_minutes: mv.overtime_minutes ?? 0,
        balance_minutes: mv.balance_minutes ?? 0,
        absence_days: mv.absence_days ?? 0,
        working_days: mv.working_days ?? 0,
        worked_days: mv.worked_days ?? 0,
        closed_at: mv.closed_at ?? null,
      }
    })
  }, [mvData, employeesData, year, month])

  // Client-side search filter and status refinement
  const filteredRows = React.useMemo(() => {
    let rows = enrichedRows

    // Client-side status filter for open vs calculated distinction
    if (statusFilter === 'open') {
      rows = rows.filter((r) => r.status === 'open')
    } else if (statusFilter === 'calculated') {
      rows = rows.filter((r) => r.status === 'calculated')
    }

    // Client-side search
    if (search) {
      const searchLower = search.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.employee_name.toLowerCase().includes(searchLower) ||
          r.personnel_number.toLowerCase().includes(searchLower)
      )
    }

    return rows
  }, [enrichedRows, statusFilter, search])

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const handleSelectAll = () => setSelectedIds(new Set(filteredRows.map((r) => r.id)))
  const handleClearSelection = () => setSelectedIds(new Set())

  // Month label (for dialogs)
  const monthLabel = React.useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return formatter.format(new Date(year, month - 1, 1))
  }, [year, month, locale])

  // Selected items for batch operations
  const selectedItems = React.useMemo(() => {
    return filteredRows.filter((r) => selectedIds.has(r.id))
  }, [filteredRows, selectedIds])

  const selectedEmployeeIds = React.useMemo(() => {
    return selectedItems.map((r) => r.employee_id)
  }, [selectedItems])

  // Clear filters handler
  const clearFilters = () => {
    setDepartmentId(null)
    setStatusFilter('all')
    setSearch('')
  }

  const hasFilters = !!(departmentId || statusFilter !== 'all' || search)

  // Detail sheet actions - close/reopen from the detail sheet
  const handleDetailClose = (id: string) => {
    setSelectedItem(null)
    setSelectedIds(new Set([id]))
    setBatchCloseOpen(true)
  }

  const handleDetailReopen = (id: string) => {
    setSelectedItem(null)
    const item = filteredRows.find((r) => r.id === id)
    if (item) {
      setSelectedIds(new Set([id]))
      setBatchReopenOpen(true)
    }
  }

  if (authLoading) {
    return <MonthlyValuesSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>
        <p className="text-muted-foreground">{t('page.subtitle')}</p>
      </div>

      <MonthlyValuesToolbar
        year={year}
        month={month}
        onYearChange={setYear}
        onMonthChange={setMonth}
        departmentId={departmentId}
        onDepartmentChange={setDepartmentId}
        departments={departments}
        isLoadingDepartments={departmentsLoading}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        onClearFilters={clearFilters}
        hasFilters={hasFilters}
      />

      <MonthlyValuesBatchActions
        selectedCount={selectedIds.size}
        totalCount={filteredRows.length}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onBatchClose={() => setBatchCloseOpen(true)}
        onBatchReopen={() => setBatchReopenOpen(true)}
        onRecalculate={() => setRecalculateOpen(true)}
        isLoading={false}
      />

      <div className="text-sm text-muted-foreground">
        {filteredRows.length === 1
          ? t('count.item', { count: filteredRows.length })
          : t('count.items', { count: filteredRows.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {mvLoading ? (
            <MonthlyValuesDataTable
              items={[]}
              isLoading={true}
              selectedIds={new Set()}
              onToggleSelect={() => {}}
              onRowClick={() => {}}
            />
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-medium">{t('empty.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.description')}</p>
            </div>
          ) : (
            <MonthlyValuesDataTable
              items={filteredRows}
              isLoading={false}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onRowClick={setSelectedItem}
            />
          )}
        </CardContent>
      </Card>

      <MonthlyValuesDetailSheet
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null)
        }}
        onClose={handleDetailClose}
        onReopen={handleDetailReopen}
      />

      <BatchCloseDialog
        open={batchCloseOpen}
        onOpenChange={setBatchCloseOpen}
        year={year}
        month={month}
        monthLabel={monthLabel}
        selectedIds={Array.from(selectedIds)}
        selectedEmployeeIds={selectedEmployeeIds}
        departmentId={departmentId}
        departmentName={departments.find((d) => d.id === departmentId)?.name ?? null}
      />

      <BatchReopenDialog
        open={batchReopenOpen}
        onOpenChange={setBatchReopenOpen}
        year={year}
        month={month}
        monthLabel={monthLabel}
        selectedItems={selectedItems.map((r) => ({
          id: r.id,
          employee_name: r.employee_name,
        }))}
      />

      <RecalculateDialog
        open={recalculateOpen}
        onOpenChange={setRecalculateOpen}
        year={year}
        month={month}
        monthLabel={monthLabel}
      />
    </div>
  )
}

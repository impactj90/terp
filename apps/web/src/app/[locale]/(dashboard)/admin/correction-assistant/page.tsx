'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useCorrectionAssistantItems,
  useCorrectionMessages,
  useUpdateCorrectionMessage,
  useDepartments,
} from '@/hooks/api'
import type {
  CorrectionAssistantItem,
  CorrectionMessage,
  UpdateCorrectionMessageRequest,
} from '@/hooks/api/use-correction-assistant'
import type { FlattenedCorrectionRow } from '@/components/correction-assistant/correction-assistant-data-table'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Pagination } from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  CorrectionAssistantDataTable,
  CorrectionAssistantDetailSheet,
  CorrectionAssistantFilters,
  CorrectionMessageDataTable,
  CorrectionMessageEditDialog,
  CorrectionAssistantSkeleton,
} from '@/components/correction-assistant'
import { formatDate } from '@/lib/time-utils'
import type { DateRange } from '@/components/ui/date-range-picker'

export default function CorrectionAssistantPage() {
  const router = useRouter()
  const t = useTranslations('correctionAssistant')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['corrections.manage'])

  // Tab state
  const [activeTab, setActiveTab] = React.useState<'corrections' | 'messages'>('corrections')

  // Correction list filters
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from, to }
  })
  const [departmentId, setDepartmentId] = React.useState<string | null>(null)
  const [severity, setSeverity] = React.useState<string>('all')
  const [errorCode, setErrorCode] = React.useState('')
  const [employeeSearch, setEmployeeSearch] = React.useState('')

  // Correction list pagination
  const [page, setPage] = React.useState(1)
  const [limit, setLimit] = React.useState(50)

  // Detail sheet
  const [selectedItem, setSelectedItem] = React.useState<CorrectionAssistantItem | null>(null)

  // Message catalog filters (client-side)
  const [messageSeverityFilter, setMessageSeverityFilter] = React.useState<string>('all')

  // Message edit dialog
  const [editMessage, setEditMessage] = React.useState<CorrectionMessage | null>(null)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1)
  }, [dateRange, departmentId, severity, errorCode])

  const enabled = !authLoading && !permLoading && canAccess

  // Departments for filter dropdown
  const { data: departmentsData, isLoading: departmentsLoading } = useDepartments({ enabled })
  const departments = (departmentsData?.data ?? []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))

  // Correction items (server-side filtered + paginated)
  const offset = (page - 1) * limit
  const from = dateRange?.from ? formatDate(dateRange.from) : undefined
  const to = dateRange?.to ? formatDate(dateRange.to) : undefined

  const { data: correctionData, isLoading: correctionsLoading } = useCorrectionAssistantItems({
    from,
    to,
    department_id: departmentId ?? undefined,
    severity: severity !== 'all' ? (severity as 'error' | 'hint') : undefined,
    error_code: errorCode || undefined,
    limit,
    offset,
    enabled,
  })

  // Message catalog (full list, filter client-side)
  const { data: messagesData, isLoading: messagesLoading } = useCorrectionMessages({ enabled })
  const updateMessage = useUpdateCorrectionMessage()

  // Flatten correction items: one row per error per employee-date
  const flattenedRows: FlattenedCorrectionRow[] = React.useMemo(() => {
    const items = correctionData?.data ?? []
    const rows: FlattenedCorrectionRow[] = []
    for (const item of items) {
      for (const err of item.errors) {
        rows.push({
          daily_value_id: item.daily_value_id,
          employee_id: item.employee_id,
          employee_name: item.employee_name,
          department_id: item.department_id,
          department_name: item.department_name,
          value_date: item.value_date,
          code: err.code,
          severity: err.severity,
          message: err.message,
          error_type: err.error_type,
        })
      }
    }
    // Client-side employee name filter
    if (employeeSearch) {
      const searchLower = employeeSearch.toLowerCase()
      return rows.filter((r) => r.employee_name.toLowerCase().includes(searchLower))
    }
    return rows
  }, [correctionData, employeeSearch])

  // Pagination calculations
  const total = correctionData?.meta?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  // Client-side message filtering
  const filteredMessages = React.useMemo(() => {
    const msgs = messagesData?.data ?? []
    if (messageSeverityFilter === 'all') return msgs
    return msgs.filter((m) => m.severity === messageSeverityFilter)
  }, [messagesData, messageSeverityFilter])

  // Handler for message update
  const handleUpdateMessage = async (id: string, data: UpdateCorrectionMessageRequest) => {
    await updateMessage.mutateAsync({ id, ...data })
  }

  // Detail sheet: find original item from flattened row
  const handleRowClick = (row: FlattenedCorrectionRow) => {
    const items = correctionData?.data ?? []
    const original = items.find((item) => item.daily_value_id === row.daily_value_id) ?? null
    setSelectedItem(original)
  }

  // Clear filters handler
  const clearFilters = () => {
    const now = new Date()
    setDateRange({
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    })
    setDepartmentId(null)
    setSeverity('all')
    setErrorCode('')
    setEmployeeSearch('')
    setPage(1)
  }

  const hasFilters = !!(
    departmentId ||
    severity !== 'all' ||
    errorCode ||
    employeeSearch
  )

  if (authLoading || permLoading) {
    return <CorrectionAssistantSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>
        <p className="text-muted-foreground">{t('page.description')}</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'corrections' | 'messages')}
      >
        <TabsList>
          <TabsTrigger value="corrections">{t('page.tabCorrections')}</TabsTrigger>
          <TabsTrigger value="messages">{t('page.tabMessages')}</TabsTrigger>
        </TabsList>

        <TabsContent value="corrections" className="space-y-4">
          <CorrectionAssistantFilters
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            departments={departments}
            selectedDepartmentId={departmentId}
            onDepartmentChange={setDepartmentId}
            severity={severity}
            onSeverityChange={setSeverity}
            errorCode={errorCode}
            onErrorCodeChange={setErrorCode}
            employeeSearch={employeeSearch}
            onEmployeeSearchChange={setEmployeeSearch}
            isLoadingDepartments={departmentsLoading}
            onClearFilters={clearFilters}
            hasFilters={hasFilters}
          />

          <div className="text-sm text-muted-foreground">
            {total === 1
              ? t('count.item', { count: total })
              : t('count.items', { count: total })}
          </div>

          <Card>
            <CardContent className="p-0">
              {correctionsLoading ? (
                <CorrectionAssistantDataTable items={[]} isLoading={true} onRowClick={handleRowClick} />
              ) : flattenedRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <h3 className="text-lg font-medium">{t('empty.title')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('empty.description')}
                  </p>
                </div>
              ) : (
                <CorrectionAssistantDataTable
                  items={flattenedRows}
                  isLoading={false}
                  onRowClick={handleRowClick}
                />
              )}
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={(newLimit) => {
                setLimit(newLimit)
                setPage(1)
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          {/* Simple severity filter for messages tab */}
          <div className="flex items-center gap-4">
            <div className="space-y-2">
              <Label>{t('filters.severity')}</Label>
              <Select
                value={messageSeverityFilter}
                onValueChange={setMessageSeverityFilter}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={t('filters.allSeverities')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.allSeverities')}</SelectItem>
                  <SelectItem value="error">{t('filters.error')}</SelectItem>
                  <SelectItem value="hint">{t('filters.hint')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {messagesLoading ? (
                <CorrectionMessageDataTable
                  messages={[]}
                  isLoading={true}
                  onUpdateMessage={handleUpdateMessage}
                  onEditMessage={setEditMessage}
                  isUpdating={updateMessage.isPending}
                />
              ) : filteredMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <h3 className="text-lg font-medium">{t('empty.messagesTitle')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('empty.messagesDescription')}
                  </p>
                </div>
              ) : (
                <CorrectionMessageDataTable
                  messages={filteredMessages}
                  isLoading={false}
                  onUpdateMessage={handleUpdateMessage}
                  onEditMessage={setEditMessage}
                  isUpdating={updateMessage.isPending}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CorrectionAssistantDetailSheet
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null)
        }}
      />

      <CorrectionMessageEditDialog
        message={editMessage}
        open={!!editMessage}
        onOpenChange={(open) => {
          if (!open) setEditMessage(null)
        }}
        onUpdate={handleUpdateMessage}
        isUpdating={updateMessage.isPending}
      />
    </div>
  )
}

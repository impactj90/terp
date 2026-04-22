'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useServiceSchedules,
  useDeleteServiceSchedule,
} from '@/hooks/use-service-schedules'
import {
  ScheduleListTable,
  type ScheduleRow,
} from '@/components/serviceobjects/schedule-list-table'
import {
  ScheduleFormSheet,
  type ExistingSchedule,
} from '@/components/serviceobjects/schedule-form-sheet'
import { GenerateOrderDialog } from '@/components/serviceobjects/generate-order-dialog'

type StatusFilter = 'all' | 'overdue' | 'due_soon' | 'ok' | 'inactive'

function parseStatusFilter(value: string | null): StatusFilter {
  if (
    value === 'overdue'
    || value === 'due_soon'
    || value === 'ok'
    || value === 'inactive'
  ) {
    return value
  }
  return 'all'
}

const DEFAULT_PAGE_SIZE = 25

export default function ServiceSchedulesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('serviceSchedules')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission([
    'service_schedules.view',
  ])
  const canManage = useHasPermission(['service_schedules.manage']).allowed

  // URL-driven filter (read-only on mount, also re-sync on back/forward)
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(() =>
    parseStatusFilter(searchParams.get('status'))
  )
  React.useEffect(() => {
    setStatusFilter(parseStatusFilter(searchParams.get('status')))
  }, [searchParams])

  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [generateId, setGenerateId] = React.useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null
  )

  const enabled = !authLoading && !permLoading && canAccess

  const { data, isLoading } = useServiceSchedules(
    {
      status: statusFilter === 'all' ? undefined : statusFilter,
      page,
      pageSize,
    },
    enabled
  )

  const deleteMutation = useDeleteServiceSchedule()

  React.useEffect(() => {
    setPage(1)
  }, [statusFilter])

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const schedules = (data?.items ?? []) as unknown as ScheduleRow[]
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const editing = editId
    ? ((data?.items ?? []).find((s) => s.id === editId) as
        | (ExistingSchedule & { id: string })
        | undefined)
    : undefined

  const handleTabChange = (value: string) => {
    const next = value as StatusFilter
    setStatusFilter(next)
    // Update URL (without full navigation / query back-stack pollution)
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (next === 'all') {
      params.delete('status')
    } else {
      params.set('status', next)
    }
    const qs = params.toString()
    router.replace(qs ? `/serviceobjects/schedules?${qs}` : '/serviceobjects/schedules')
  }

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return
    try {
      await deleteMutation.mutateAsync({ id: confirmDeleteId })
      toast.success(t('deleteSuccess'))
      setConfirmDeleteId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('deleteError'))
    }
  }

  if (authLoading || permLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!canAccess) return null

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('newSchedule')}
          </Button>
        )}
      </div>

      {/* Tab filter */}
      <Tabs value={statusFilter} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
          <TabsTrigger value="overdue">{t('tabs.overdue')}</TabsTrigger>
          <TabsTrigger value="due_soon">{t('tabs.dueSoon')}</TabsTrigger>
          <TabsTrigger value="ok">{t('tabs.ok')}</TabsTrigger>
          <TabsTrigger value="inactive">{t('tabs.inactive')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <ScheduleListTable
            schedules={schedules}
            showServiceObjectColumn={true}
            isLoading={isLoading}
            onEdit={(id) => setEditId(id)}
            onDelete={(id) => setConfirmDeleteId(id)}
            onGenerateOrder={(id) => setGenerateId(id)}
          />
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={pageSize}
          onPageChange={setPage}
          onLimitChange={(l) => {
            setPageSize(l)
            setPage(1)
          }}
        />
      )}

      {/* Create / Edit sheet */}
      <ScheduleFormSheet
        open={createOpen || !!editId}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false)
            setEditId(null)
          }
        }}
        existing={editing ?? null}
      />

      {/* Generate-order dialog */}
      {generateId && (
        <GenerateOrderDialog
          scheduleId={generateId}
          open={!!generateId}
          onOpenChange={(o) => {
            if (!o) setGenerateId(null)
          }}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteId(null)
        }}
        title={t('deleteDialog.title')}
        description={t('deleteDialog.description')}
        confirmLabel={t('deleteDialog.confirm')}
        cancelLabel={t('deleteDialog.cancel')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}

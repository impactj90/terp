'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useReports,
  useReport,
  useDeleteReport,
  useDownloadReport,
} from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  ReportSkeleton,
  ReportToolbar,
  ReportDataTable,
  ReportDetailSheet,
  GenerateReportDialog,
} from '@/components/reports'
import type { ReportRow } from '@/components/reports'

export default function ReportsPage() {
  const router = useRouter()
  const t = useTranslations('reports')
  const tc = useTranslations('common')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['reports.view'])

  // Filters
  const [reportTypeFilter, setReportTypeFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  // Overlays
  const [generateOpen, setGenerateOpen] = React.useState(false)
  const [selectedItem, setSelectedItem] = React.useState<ReportRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ReportRow | null>(null)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const enabled = !authLoading && !permLoading && canAccess

  // Queries
  const { data: reportsData, isLoading: reportsLoading } = useReports({
    reportType: reportTypeFilter !== 'all' ? reportTypeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    enabled,
  })

  const { data: fullReportData } = useReport(selectedItem?.id)

  // Mutations
  const deleteMutation = useDeleteReport()
  const downloadMutation = useDownloadReport()

  // Map API data to row type
  const reportRows: ReportRow[] = React.useMemo(() => {
    const items = reportsData?.data ?? []
    return items.map((item) => ({
      id: item.id ?? '',
      name: item.name,
      report_type: item.report_type ?? 'custom',
      format: item.format,
      status: item.status ?? 'pending',
      row_count: item.row_count,
      file_size: item.file_size,
      requested_at: item.requested_at,
      completed_at: item.completed_at,
      error_message: item.error_message,
    }))
  }, [reportsData])

  // Handlers
  const handleDownload = (item: ReportRow) => {
    downloadMutation.mutate({ id: item.id })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteTarget.id } })
      setDeleteTarget(null)
      if (selectedItem?.id === deleteTarget.id) {
        setSelectedItem(null)
      }
    } catch {
      // Error handled by mutation state
    }
  }

  if (authLoading || permLoading) {
    return <ReportSkeleton />
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

      <ReportToolbar
        reportType={reportTypeFilter}
        onReportTypeChange={setReportTypeFilter}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        onGenerate={() => setGenerateOpen(true)}
      />

      <div className="text-sm text-muted-foreground">
        {reportRows.length === 1
          ? t('count.item', { count: reportRows.length })
          : t('count.items', { count: reportRows.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {reportsLoading ? (
            <ReportDataTable
              items={[]}
              isLoading={true}
              onRowClick={() => {}}
              onDownload={() => {}}
              onDelete={() => {}}
            />
          ) : reportRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-medium">{t('empty.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.description')}</p>
              <Button onClick={() => setGenerateOpen(true)} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                {t('empty.generateButton')}
              </Button>
            </div>
          ) : (
            <ReportDataTable
              items={reportRows}
              isLoading={false}
              onRowClick={setSelectedItem}
              onDownload={handleDownload}
              onDelete={setDeleteTarget}
            />
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <ReportDetailSheet
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null)
        }}
        onDownload={handleDownload}
        onDelete={(item) => {
          setSelectedItem(null)
          setDeleteTarget(item)
        }}
        fullReport={fullReportData ?? null}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('delete.title')}
        description={t('delete.description')}
        confirmLabel={t('delete.confirm')}
        cancelLabel={tc('cancel')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      {/* Generate Report Dialog */}
      <GenerateReportDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
      />
    </div>
  )
}

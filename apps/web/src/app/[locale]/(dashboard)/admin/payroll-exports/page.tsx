'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  usePayrollExports,
  usePayrollExport,
  useDeletePayrollExport,
  useDownloadPayrollExport,
} from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  PayrollExportSkeleton,
  PayrollExportToolbar,
  PayrollExportDataTable,
  PayrollExportDetailSheet,
  GenerateExportDialog,
  PayrollExportPreview,
} from '@/components/payroll-exports'
import type { PayrollExportRow } from '@/components/payroll-exports'

export default function PayrollExportsPage() {
  const router = useRouter()
  const t = useTranslations('payrollExports')
  const tc = useTranslations('common')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters
  const [year, setYear] = React.useState(() => new Date().getFullYear())
  const [month, setMonth] = React.useState(() => new Date().getMonth() + 1)
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  // Overlays
  const [generateOpen, setGenerateOpen] = React.useState(false)
  const [selectedItem, setSelectedItem] = React.useState<PayrollExportRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<PayrollExportRow | null>(null)
  const [previewTarget, setPreviewTarget] = React.useState<PayrollExportRow | null>(null)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const enabled = !authLoading && isAdmin

  // Queries
  const { data: exportsData, isLoading: exportsLoading } = usePayrollExports({
    year,
    month,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    enabled,
  })

  const { data: fullExportData } = usePayrollExport(selectedItem?.id)

  // Mutations
  const deleteMutation = useDeletePayrollExport()
  const downloadMutation = useDownloadPayrollExport()

  // Map API data to row type
  const exportRows: PayrollExportRow[] = React.useMemo(() => {
    const items = exportsData?.data ?? []
    return items.map((item) => ({
      id: item.id ?? '',
      year: item.year ?? year,
      month: item.month ?? month,
      export_type: item.export_type ?? 'standard',
      format: item.format ?? '',
      status: item.status ?? 'pending',
      employee_count: item.employee_count,
      total_hours: item.total_hours,
      requested_at: item.requested_at,
      completed_at: item.completed_at,
      error_message: item.error_message,
    }))
  }, [exportsData, year, month])

  // Handlers
  const handleDownload = (item: PayrollExportRow) => {
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

  const handlePreview = (item: PayrollExportRow) => {
    setPreviewTarget(item)
    setSelectedItem(null) // Close detail sheet if open
  }

  if (authLoading) {
    return <PayrollExportSkeleton />
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

      <PayrollExportToolbar
        year={year}
        month={month}
        onYearChange={setYear}
        onMonthChange={setMonth}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        onGenerate={() => setGenerateOpen(true)}
      />

      <div className="text-sm text-muted-foreground">
        {exportRows.length === 1
          ? t('count.item', { count: exportRows.length })
          : t('count.items', { count: exportRows.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {exportsLoading ? (
            <PayrollExportDataTable
              items={[]}
              isLoading={true}
              onRowClick={() => {}}
              onPreview={() => {}}
              onDownload={() => {}}
              onDelete={() => {}}
            />
          ) : exportRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-medium">{t('empty.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.description')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.generateHint')}</p>
              <Button onClick={() => setGenerateOpen(true)} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                {t('empty.generateButton')}
              </Button>
            </div>
          ) : (
            <PayrollExportDataTable
              items={exportRows}
              isLoading={false}
              onRowClick={setSelectedItem}
              onPreview={handlePreview}
              onDownload={handleDownload}
              onDelete={setDeleteTarget}
            />
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <PayrollExportDetailSheet
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null)
        }}
        onPreview={handlePreview}
        onDownload={handleDownload}
        onDelete={(item) => {
          setSelectedItem(null)
          setDeleteTarget(item)
        }}
        fullExport={fullExportData ? {
          export_interface_id: fullExportData.export_interface_id,
          file_size: fullExportData.file_size,
          row_count: fullExportData.row_count,
          total_overtime: fullExportData.total_overtime,
          started_at: fullExportData.started_at,
          requested_at: fullExportData.requested_at,
          parameters: fullExportData.parameters,
        } : null}
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

      {/* Generate Export Dialog */}
      <GenerateExportDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        defaultYear={year}
        defaultMonth={month > 1 ? month - 1 : 12}
      />

      {/* Preview */}
      <PayrollExportPreview
        exportId={previewTarget?.id}
        exportYear={previewTarget?.year}
        exportMonth={previewTarget?.month}
        open={!!previewTarget}
        onOpenChange={(open) => {
          if (!open) setPreviewTarget(null)
        }}
      />
    </div>
  )
}

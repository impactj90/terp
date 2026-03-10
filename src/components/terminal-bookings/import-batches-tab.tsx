'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Upload, X, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useImportBatches,
  useTriggerTerminalImport,
} from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFn = (key: string, values?: Record<string, any>) => string

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImportBatch = any

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed'

const BATCH_STATUS_CONFIG: Record<string, { className: string; labelKey: string }> = {
  pending: {
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    labelKey: 'batches.statusPending',
  },
  processing: {
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    labelKey: 'batches.statusProcessing',
  },
  completed: {
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    labelKey: 'batches.statusCompleted',
  },
  failed: {
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    labelKey: 'batches.statusFailed',
  },
}

export function ImportBatchesTab() {
  const t = useTranslations('adminTerminalBookings')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['terminal_bookings.manage'])

  // Filter state
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')
  const [triggerImportOpen, setTriggerImportOpen] = React.useState(false)

  // Data
  const { data: batchData, isLoading } = useImportBatches({
    status: statusFilter !== 'all' ? (statusFilter as 'pending' | 'processing' | 'completed' | 'failed') : undefined,
    enabled: !authLoading && !permLoading && canAccess,
  })

  const batches = batchData?.data ?? []

  const hasFilters = statusFilter !== 'all'

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => setTriggerImportOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          {t('batches.triggerImport')}
        </Button>

        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">{t('batches.filterAll')}</TabsTrigger>
            <TabsTrigger value="pending">{t('batches.filterPending')}</TabsTrigger>
            <TabsTrigger value="processing">{t('batches.filterProcessing')}</TabsTrigger>
            <TabsTrigger value="completed">{t('batches.filterCompleted')}</TabsTrigger>
            <TabsTrigger value="failed">{t('batches.filterFailed')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter('all')}
          >
            <X className="mr-2 h-4 w-4" />
            {t('batches.clearFilters')}
          </Button>
        )}
      </div>

      {/* Count */}
      <div className="text-sm text-muted-foreground">
        {batches.length === 1
          ? (t as TranslationFn)('batches.count', { count: batches.length })
          : (t as TranslationFn)('batches.countPlural', { count: batches.length })}
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">{t('batches.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {hasFilters ? t('batches.emptyFilterHint') : t('batches.emptyHint')}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('batches.columnBatchReference')}</TableHead>
                  <TableHead>{t('batches.columnSource')}</TableHead>
                  <TableHead>{t('batches.columnTerminalId')}</TableHead>
                  <TableHead>{t('batches.columnStatus')}</TableHead>
                  <TableHead>{t('batches.columnTotal')}</TableHead>
                  <TableHead>{t('batches.columnImported')}</TableHead>
                  <TableHead>{t('batches.columnFailed')}</TableHead>
                  <TableHead>{t('batches.columnStartedAt')}</TableHead>
                  <TableHead>{t('batches.columnCompletedAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => {
                  const statusConfig = BATCH_STATUS_CONFIG[batch.status] || BATCH_STATUS_CONFIG.pending
                  return (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.batchReference}</TableCell>
                      <TableCell>{batch.source ?? '-'}</TableCell>
                      <TableCell>{batch.terminalId ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusConfig!.className}>
                          {t(statusConfig!.labelKey as Parameters<typeof t>[0])}
                        </Badge>
                      </TableCell>
                      <TableCell>{batch.recordsTotal ?? '-'}</TableCell>
                      <TableCell>{batch.recordsImported ?? '-'}</TableCell>
                      <TableCell>{batch.recordsFailed ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {batch.startedAt
                          ? format(new Date(batch.startedAt), 'dd.MM.yyyy HH:mm')
                          : '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {batch.completedAt
                          ? format(new Date(batch.completedAt), 'dd.MM.yyyy HH:mm')
                          : '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Trigger Import Dialog */}
      <TriggerImportDialog
        open={triggerImportOpen}
        onOpenChange={setTriggerImportOpen}
      />
    </>
  )
}

// ==================== Trigger Import Dialog ====================

interface TriggerImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ImportResult {
  batch: ImportBatch
  message?: string
  was_duplicate?: boolean
}

function TriggerImportDialog({
  open,
  onOpenChange,
}: TriggerImportDialogProps) {
  const t = useTranslations('adminTerminalBookings')
  const [batchReference, setBatchReference] = React.useState('')
  const [terminalId, setTerminalId] = React.useState('')
  const [bookingsText, setBookingsText] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<ImportResult | null>(null)

  const importMutation = useTriggerTerminalImport()

  React.useEffect(() => {
    if (open) {
      setBatchReference('')
      setTerminalId('')
      setBookingsText('')
      setError(null)
      setResult(null)
    }
  }, [open])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!batchReference.trim()) errors.push(t('import.validationBatchRefRequired'))
    if (!terminalId.trim()) errors.push(t('import.validationTerminalIdRequired'))

    const lines = bookingsText
      .trim()
      .split('\n')
      .filter((line) => line.trim().length > 0)

    if (lines.length === 0) {
      errors.push(t('import.validationBookingsRequired'))
    }

    // Parse booking lines
    const bookings: Array<{ employeePin: string; rawTimestamp: string; rawBookingCode: string }> = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const parts = line.split(',').map((s) => s.trim())
      if (parts.length < 3) {
        errors.push((t as TranslationFn)('import.validationInvalidLine', { line: i + 1 }))
        break
      }
      bookings.push({
        employeePin: parts[0]!,
        rawTimestamp: parts[1]!,
        rawBookingCode: parts[2]!,
      })
    }

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      const response = await importMutation.mutateAsync({
        batchReference: batchReference.trim(),
        terminalId: terminalId.trim(),
        bookings,
      })
      setResult(response as unknown as ImportResult)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('import.failedImport'))
    }
  }

  const isPending = importMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('import.title')}</DialogTitle>
          <DialogDescription>{t('import.description')}</DialogDescription>
        </DialogHeader>

        {result ? (
          // Result summary view
          <div className="space-y-4 py-2">
            <h3 className="font-medium">{t('import.resultTitle')}</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">{t('import.resultTotal')}</p>
                <p className="text-lg font-semibold">{result.batch.recordsTotal ?? 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('import.resultImported')}</p>
                <p className="text-lg font-semibold text-green-600">{result.batch.recordsImported ?? 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('import.resultFailed')}</p>
                <p className="text-lg font-semibold text-red-600">{result.batch.recordsFailed ?? 0}</p>
              </div>
            </div>
            {result.was_duplicate && (
              <Alert>
                <AlertDescription>{t('import.resultDuplicate')}</AlertDescription>
              </Alert>
            )}
            {!result.was_duplicate && (
              <Alert>
                <AlertDescription>{t('import.resultSuccess')}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                {t('import.close')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Input form view
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="batchReference">{t('import.fieldBatchReference')} *</Label>
                <Input
                  id="batchReference"
                  value={batchReference}
                  onChange={(e) => setBatchReference(e.target.value)}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="importTerminalId">{t('import.fieldTerminalId')} *</Label>
                <Input
                  id="importTerminalId"
                  value={terminalId}
                  onChange={(e) => setTerminalId(e.target.value)}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bookingsData">{t('import.fieldBookings')} *</Label>
                <p className="text-xs text-muted-foreground">{t('import.bookingsHint')}</p>
                <Textarea
                  id="bookingsData"
                  value={bookingsText}
                  onChange={(e) => setBookingsText(e.target.value)}
                  disabled={isPending}
                  rows={6}
                  placeholder={t('import.bookingsPlaceholder')}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                {t('import.cancel')}
              </Button>
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? t('import.importing') : t('import.submit')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

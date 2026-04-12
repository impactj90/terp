'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { toast } from 'sonner'
import { useAuth } from '@/providers/auth-provider'
import {
  useHasPermission,
  useWhStocktake,
  useWhStocktakePositions,
  useWhStocktakeStats,
  useStartStocktakeCounting,
  useRecordStocktakeCount,
  useReviewStocktakePosition,
  useSkipStocktakePosition,
  useCompleteStocktake,
  useCancelStocktake,
  useDeleteStocktake,
  useGenerateStocktakePdf,
} from '@/hooks'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  XCircle,
  Trash2,
  FileDown,
  Search,
  SkipForward,
  Loader2,
} from 'lucide-react'

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('warehouseStocktake')
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    DRAFT: 'secondary',
    IN_PROGRESS: 'default',
    COMPLETED: 'outline',
    CANCELLED: 'destructive',
  }
  const labels: Record<string, string> = {
    DRAFT: t('statusDraft'),
    IN_PROGRESS: t('statusInProgress'),
    COMPLETED: t('statusCompleted'),
    CANCELLED: t('statusCancelled'),
  }
  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {labels[status] ?? status}
    </Badge>
  )
}

export default function WhStocktakeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations('warehouseStocktake')
  const locale = useLocale()
  const { isLoading: authLoading } = useAuth()
  const { allowed: _canView } = useHasPermission(['wh_stocktake.view'])
  const { allowed: canCreate } = useHasPermission(['wh_stocktake.create'])
  const { allowed: canCount } = useHasPermission(['wh_stocktake.count'])
  const { allowed: canComplete } = useHasPermission(['wh_stocktake.complete'])
  const { allowed: canDelete } = useHasPermission(['wh_stocktake.delete'])

  const id = params.id as string

  // Queries
  const { data: stocktake, isLoading } = useWhStocktake(id)
  const { data: stats } = useWhStocktakeStats(id)

  const [search, setSearch] = React.useState('')
  const [uncountedOnly, setUncountedOnly] = React.useState(false)
  const [differenceOnly, setDifferenceOnly] = React.useState(false)
  const [posPage, setPosPage] = React.useState(1)

  const { data: posData } = useWhStocktakePositions(id, {
    search: search || undefined,
    uncountedOnly: uncountedOnly || undefined,
    differenceOnly: differenceOnly || undefined,
    page: posPage,
    pageSize: 50,
  })

  // Mutations
  const startMut = useStartStocktakeCounting()
  const recordMut = useRecordStocktakeCount()
  const reviewMut = useReviewStocktakePosition()
  const skipMut = useSkipStocktakePosition()
  const completeMut = useCompleteStocktake()
  const cancelMut = useCancelStocktake()
  const deleteMut = useDeleteStocktake()
  const pdfMut = useGenerateStocktakePdf()

  // Dialogs
  const [confirmAction, setConfirmAction] = React.useState<'complete' | 'cancel' | 'delete' | null>(null)
  const [countDialogPos, setCountDialogPos] = React.useState<{
    id: string
    articleId: string
    articleNumber: string
    articleName: string
    unit: string
    expectedQuantity: number
  } | null>(null)
  const [countValue, setCountValue] = React.useState('')
  const [countNote, setCountNote] = React.useState('')
  const [skipDialogId, setSkipDialogId] = React.useState<string | null>(null)
  const [skipReason, setSkipReason] = React.useState('')

  if (authLoading || isLoading) return null
  if (!stocktake) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  const positions = posData?.items ?? []
  const posTotal = posData?.total ?? 0
  const posTotalPages = Math.ceil(posTotal / 50)
  const isInProgress = stocktake.status === 'IN_PROGRESS'
  const isCompleted = stocktake.status === 'COMPLETED'
  const isDraft = stocktake.status === 'DRAFT'

  // Handlers
  const handleStart = async () => {
    try {
      await startMut.mutateAsync({ id })
      toast.success(t('statusInProgress'))
    } catch { toast.error(t('errorGeneric')) }
  }

  const handleConfirmAction = async () => {
    try {
      if (confirmAction === 'complete') {
        await completeMut.mutateAsync({ id })
        toast.success(t('toastCompleted'))
      } else if (confirmAction === 'cancel') {
        await cancelMut.mutateAsync({ id })
        toast.success(t('toastCancelled'))
      } else if (confirmAction === 'delete') {
        await deleteMut.mutateAsync({ id })
        toast.success(t('toastDeleted'))
        router.push('/warehouse/stocktake')
      }
      setConfirmAction(null)
    } catch { toast.error(t('errorGeneric')) }
  }

  const handleRecordCount = async () => {
    if (!countDialogPos || !countValue) return
    try {
      await recordMut.mutateAsync({
        stocktakeId: id,
        articleId: countDialogPos.articleId,
        countedQuantity: parseFloat(countValue),
        note: countNote || null,
      })
      toast.success(t('toastCounted'))
      setCountDialogPos(null)
      setCountValue('')
      setCountNote('')
    } catch { toast.error(t('errorGeneric')) }
  }

  const handleSkip = async () => {
    if (!skipDialogId || !skipReason) return
    try {
      await skipMut.mutateAsync({
        positionId: skipDialogId,
        skipReason,
      })
      setSkipDialogId(null)
      setSkipReason('')
    } catch { toast.error(t('errorGeneric')) }
  }

  const handlePdf = async () => {
    try {
      const result = await pdfMut.mutateAsync({ id })
      if (result?.signedUrl) {
        window.open(result.signedUrl, '_blank')
      }
    } catch { toast.error(t('errorGeneric')) }
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/warehouse/stocktake')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {stocktake.number} - {stocktake.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={stocktake.status} />
              <span className="text-sm text-muted-foreground">
                {t('referenceDate')}: {new Date(stocktake.referenceDate).toLocaleDateString(locale)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isDraft && canCreate && (
            <Button onClick={handleStart} disabled={startMut.isPending}>
              <Play className="mr-2 h-4 w-4" />
              {t('startCounting')}
            </Button>
          )}
          {isInProgress && canComplete && (
            <Button onClick={() => setConfirmAction('complete')} disabled={completeMut.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {t('complete')}
            </Button>
          )}
          {(isDraft || isInProgress) && canComplete && (
            <Button variant="outline" onClick={() => setConfirmAction('cancel')} disabled={cancelMut.isPending}>
              <XCircle className="mr-2 h-4 w-4" />
              {t('cancel')}
            </Button>
          )}
          {isDraft && canDelete && (
            <Button variant="destructive" onClick={() => setConfirmAction('delete')} disabled={deleteMut.isPending}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('delete')}
            </Button>
          )}
          {isCompleted && (
            <Button variant="outline" onClick={handlePdf} disabled={pdfMut.isPending}>
              {pdfMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              {t('generatePdf')}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('positions')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('counted')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.counted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('skipped')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.skipped}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('reviewed')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.reviewed}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Positions Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('articleNumber')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPosPage(1) }}
          />
        </div>
        {isInProgress && (
          <Button
            variant={uncountedOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setUncountedOnly(!uncountedOnly); setDifferenceOnly(false); setPosPage(1) }}
          >
            {t('filterUncounted')}
          </Button>
        )}
        {(isCompleted || isInProgress) && (
          <Button
            variant={differenceOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setDifferenceOnly(!differenceOnly); setUncountedOnly(false); setPosPage(1) }}
          >
            {t('filterDifferences')}
          </Button>
        )}
      </div>

      {/* Position Table */}
      {positions.length === 0 ? (
        <div className="p-4 text-muted-foreground text-sm">{t('noPositions')}</div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="divide-y sm:hidden">
            {positions.map((pos) => (
              <div
                key={pos.id}
                className="py-3"
                onClick={() => {
                  if (isInProgress && canCount) {
                    setCountDialogPos({
                      id: pos.id,
                      articleId: pos.articleId,
                      articleNumber: pos.articleNumber,
                      articleName: pos.articleName,
                      unit: pos.unit,
                      expectedQuantity: pos.expectedQuantity,
                    })
                    setCountValue(pos.countedQuantity !== null ? String(pos.countedQuantity) : '')
                    setCountNote(pos.note ?? '')
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{pos.articleName}</p>
                    <span className="text-xs font-mono text-muted-foreground">{pos.articleNumber}</span>
                    {pos.warehouseLocation && (
                      <span className="text-xs text-muted-foreground ml-2">{pos.warehouseLocation}</span>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm">
                      <span className="text-muted-foreground">{t('expectedQuantity')}: </span>
                      <span className="font-mono">{pos.expectedQuantity}</span>
                    </p>
                    {pos.countedQuantity !== null && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">{t('countedQuantity')}: </span>
                        <span className="font-mono font-medium">{pos.countedQuantity}</span>
                      </p>
                    )}
                    {pos.difference !== null && pos.difference !== 0 && (
                      <p className={`text-sm font-mono font-medium ${pos.difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {pos.difference > 0 ? '+' : ''}{pos.difference}
                      </p>
                    )}
                    {pos.skipped && (
                      <Badge variant="secondary">{t('skipped')}</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('articleNumber')}</TableHead>
                  <TableHead>{t('article')}</TableHead>
                  <TableHead>{t('location')}</TableHead>
                  <TableHead>{t('unit')}</TableHead>
                  <TableHead className="text-right">{t('expectedQuantity')}</TableHead>
                  <TableHead className="text-right">{t('countedQuantity')}</TableHead>
                  <TableHead className="text-right">{t('difference')}</TableHead>
                  <TableHead className="text-right">{t('valueDifference')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  {isCompleted && <TableHead>{t('reviewed')}</TableHead>}
                  {isInProgress && canCount && <TableHead>{t('actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((pos) => (
                  <TableRow
                    key={pos.id}
                    className={isInProgress && canCount ? 'cursor-pointer hover:bg-muted/50' : ''}
                    onClick={() => {
                      if (isInProgress && canCount && !pos.skipped) {
                        setCountDialogPos({
                          id: pos.id,
                          articleId: pos.articleId,
                          articleNumber: pos.articleNumber,
                          articleName: pos.articleName,
                          unit: pos.unit,
                          expectedQuantity: pos.expectedQuantity,
                        })
                        setCountValue(pos.countedQuantity !== null ? String(pos.countedQuantity) : '')
                        setCountNote(pos.note ?? '')
                      }
                    }}
                  >
                    <TableCell className="font-mono">{pos.articleNumber}</TableCell>
                    <TableCell>{pos.articleName}</TableCell>
                    <TableCell>{pos.warehouseLocation ?? '\u2014'}</TableCell>
                    <TableCell>{pos.unit}</TableCell>
                    <TableCell className="text-right font-mono">{pos.expectedQuantity}</TableCell>
                    <TableCell className="text-right font-mono">
                      {pos.countedQuantity !== null ? pos.countedQuantity : '\u2014'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {pos.difference !== null ? (
                        <span className={pos.difference === 0 ? '' : pos.difference > 0 ? 'text-green-600' : 'text-red-600'}>
                          {pos.difference > 0 ? '+' : ''}{pos.difference}
                        </span>
                      ) : '\u2014'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {pos.valueDifference !== null
                        ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(pos.valueDifference)
                        : '\u2014'}
                    </TableCell>
                    <TableCell>
                      {pos.skipped ? (
                        <Badge variant="secondary">{t('skipped')}</Badge>
                      ) : pos.countedQuantity !== null ? (
                        <Badge variant="outline">{t('counted')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('uncounted')}</Badge>
                      )}
                    </TableCell>
                    {isCompleted && (
                      <TableCell>
                        <Checkbox
                          checked={pos.reviewed}
                          onCheckedChange={(checked) => {
                            if (canComplete) {
                              reviewMut.mutate({
                                positionId: pos.id,
                                reviewed: !!checked,
                              })
                            }
                          }}
                          disabled={!canComplete}
                        />
                      </TableCell>
                    )}
                    {isInProgress && canCount && (
                      <TableCell>
                        {!pos.skipped && pos.countedQuantity === null && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSkipDialogId(pos.id)
                              setSkipReason('')
                            }}
                          >
                            <SkipForward className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {posTotalPages > 1 && (
            <div className="flex items-center justify-center sm:justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={posPage === 1}
                onClick={() => setPosPage((p) => p - 1)}
              >
                &laquo;
              </Button>
              <span className="text-xs sm:text-sm text-muted-foreground">
                {posPage} / {posTotalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={posPage >= posTotalPages}
                onClick={() => setPosPage((p) => p + 1)}
              >
                &raquo;
              </Button>
            </div>
          )}
        </>
      )}

      {/* Count Dialog */}
      <Dialog open={!!countDialogPos} onOpenChange={(open) => { if (!open) setCountDialogPos(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('enterCountedQuantity')}</DialogTitle>
            <DialogDescription>
              {countDialogPos?.articleNumber} - {countDialogPos?.articleName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{t('countedQuantity')} ({countDialogPos?.unit})</label>
              <Input
                type="number"
                inputMode="decimal"
                value={countValue}
                onChange={(e) => setCountValue(e.target.value)}
                className="mt-1 h-14 text-2xl text-center"
                min={0}
                step="any"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('note')}</label>
              <Input
                value={countNote}
                onChange={(e) => setCountNote(e.target.value)}
                placeholder={t('note')}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCountDialogPos(null)}>
              {t('back')}
            </Button>
            <Button
              onClick={handleRecordCount}
              disabled={!countValue || recordMut.isPending}
            >
              {recordMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('toastCounted')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skip Dialog */}
      <Dialog open={!!skipDialogId} onOpenChange={(open) => { if (!open) setSkipDialogId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('skip')}</DialogTitle>
            <DialogDescription>{t('skipReason')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder={t('skipReason')}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipDialogId(null)}>
              {t('back')}
            </Button>
            <Button
              onClick={handleSkip}
              disabled={!skipReason || skipMut.isPending}
            >
              {skipMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('skip')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Action Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'complete' && t('complete')}
              {confirmAction === 'cancel' && t('cancel')}
              {confirmAction === 'delete' && t('delete')}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'complete' && t('confirmComplete')}
              {confirmAction === 'cancel' && t('confirmCancel')}
              {confirmAction === 'delete' && t('confirmDelete')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              {t('back')}
            </Button>
            <Button
              variant={confirmAction === 'delete' ? 'destructive' : 'default'}
              onClick={handleConfirmAction}
              disabled={completeMut.isPending || cancelMut.isPending || deleteMut.isPending}
            >
              {(completeMut.isPending || cancelMut.isPending || deleteMut.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {confirmAction === 'complete' && t('complete')}
              {confirmAction === 'cancel' && t('cancel')}
              {confirmAction === 'delete' && t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

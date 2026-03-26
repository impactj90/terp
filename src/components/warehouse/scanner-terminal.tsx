'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  PackageCheck,
  PackageMinus,
  ClipboardList,
  Undo2,
  ArrowLeft,
  Check,
  Package,
  MapPin,
  ScanLine,
} from 'lucide-react'
import { QrScanner } from './qr-scanner'
import {
  useResolveQrCode,
  useResolveByNumber,
} from '@/hooks/use-wh-qr'
import { useCreateWhWithdrawal } from '@/hooks/use-wh-withdrawals'
import { useBookSinglePosition } from '@/hooks/use-wh-stock-movements'
import { useCancelWhWithdrawal } from '@/hooks/use-wh-withdrawals'
import { useTRPC } from '@/trpc'
import { useQuery } from '@tanstack/react-query'

// --- Types ---

type ScannerState = 'IDLE' | 'SCANNED' | 'GOODS_RECEIPT' | 'WITHDRAWAL' | 'INVENTORY' | 'STORNO' | 'BOOKED'

interface ResolvedArticle {
  id: string
  number: string
  name: string
  unit: string
  currentStock: number | null
  minStock: number | null
  warehouseLocation: string | null
  images: unknown
  stockTracking: boolean
}

interface ScanHistoryEntry {
  timestamp: string
  articleNumber: string
  articleName: string
  action: 'goodsReceipt' | 'withdrawal' | 'inventory' | 'storno' | 'lookup'
  quantity?: number
  success: boolean
}

const HISTORY_KEY = 'terp-scan-history'
const MAX_HISTORY = 50

// --- Helpers ---

function loadHistory(): ScanHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ScanHistoryEntry[]
  } catch {
    return []
  }
}

function saveHistory(entries: ScanHistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
  } catch {
    // Storage full, ignore
  }
}

function addHistoryEntry(entry: ScanHistoryEntry) {
  const entries = loadHistory()
  entries.unshift(entry)
  saveHistory(entries)
  return entries.slice(0, MAX_HISTORY)
}

// --- Component ---

export function ScannerTerminal() {
  const t = useTranslations('warehouseScanner')
  const [state, setState] = React.useState<ScannerState>('IDLE')
  const [article, setArticle] = React.useState<ResolvedArticle | null>(null)
  const [history, setHistory] = React.useState<ScanHistoryEntry[]>([])
  const [scannerEnabled, setScannerEnabled] = React.useState(true)

  // Goods Receipt state
  const [selectedPositionId, setSelectedPositionId] = React.useState<string | null>(null)
  const [grQuantity, setGrQuantity] = React.useState<string>('')

  // Withdrawal state
  const [wdQuantity, setWdQuantity] = React.useState<string>('')
  const [wdRefType, setWdRefType] = React.useState<'ORDER' | 'DOCUMENT' | 'NONE'>('NONE')
  const [wdNotes, setWdNotes] = React.useState('')

  // Storno state
  const [selectedMovementId, setSelectedMovementId] = React.useState<string | null>(null)

  // Load history from localStorage
  React.useEffect(() => {
    setHistory(loadHistory())
  }, [])

  // Mutations
  const resolveQrCode = useResolveQrCode()
  const resolveByNumber = useResolveByNumber()
  const createWithdrawal = useCreateWhWithdrawal()
  const bookSingleGR = useBookSinglePosition()
  const cancelWithdrawal = useCancelWhWithdrawal()

  // Queries (conditional)
  const trpc = useTRPC()
  const { data: pendingPositions } = useQuery(
    trpc.warehouse.qr.pendingPositionsForArticle.queryOptions(
      { articleId: article?.id ?? '' },
      { enabled: !!article && (state === 'SCANNED' || state === 'GOODS_RECEIPT') }
    )
  )
  const { data: recentMovements } = useQuery(
    trpc.warehouse.qr.recentMovements.queryOptions(
      { articleId: article?.id ?? '', limit: 10 },
      { enabled: !!article && state === 'STORNO' }
    )
  )

  // --- Handlers ---

  const resetToIdle = React.useCallback(() => {
    setState('IDLE')
    setArticle(null)
    setSelectedPositionId(null)
    setGrQuantity('')
    setWdQuantity('')
    setWdRefType('NONE')
    setWdNotes('')
    setSelectedMovementId(null)
    setScannerEnabled(true)
  }, [])

  const handleScan = React.useCallback(
    async (code: string) => {
      setScannerEnabled(false)
      try {
        const result = await resolveQrCode.mutateAsync({ code })
        if (result) {
          setArticle(result as ResolvedArticle)
          setState('SCANNED')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t('articleNotFound')
        toast.error(message)
        setScannerEnabled(true)
      }
    },
    [resolveQrCode, t]
  )

  const handleManualInput = React.useCallback(
    async (articleNumber: string) => {
      setScannerEnabled(false)
      try {
        const result = await resolveByNumber.mutateAsync({ articleNumber })
        if (result) {
          setArticle(result as ResolvedArticle)
          setState('SCANNED')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t('articleNotFound')
        toast.error(message)
        setScannerEnabled(true)
      }
    },
    [resolveByNumber, t]
  )

  const handleBookGoodsReceipt = React.useCallback(async () => {
    if (!selectedPositionId || !grQuantity) return
    try {
      await bookSingleGR.mutateAsync({
        purchaseOrderPositionId: selectedPositionId,
        quantity: parseFloat(grQuantity),
      })
      setState('BOOKED')
      toast.success(t('success'))
      const updated = addHistoryEntry({
        timestamp: new Date().toISOString(),
        articleNumber: article!.number,
        articleName: article!.name,
        action: 'goodsReceipt',
        quantity: parseFloat(grQuantity),
        success: true,
      })
      setHistory(updated)
      navigator.vibrate?.(200)
      setTimeout(resetToIdle, 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler'
      toast.error(message)
    }
  }, [selectedPositionId, grQuantity, bookSingleGR, article, t, resetToIdle])

  const handleBookWithdrawal = React.useCallback(async () => {
    if (!article || !wdQuantity) return
    try {
      await createWithdrawal.mutateAsync({
        articleId: article.id,
        quantity: parseFloat(wdQuantity),
        referenceType: wdRefType,
        notes: wdNotes || undefined,
      })
      setState('BOOKED')
      toast.success(t('success'))
      const updated = addHistoryEntry({
        timestamp: new Date().toISOString(),
        articleNumber: article.number,
        articleName: article.name,
        action: 'withdrawal',
        quantity: parseFloat(wdQuantity),
        success: true,
      })
      setHistory(updated)
      navigator.vibrate?.(200)
      setTimeout(resetToIdle, 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler'
      toast.error(message)
    }
  }, [article, wdQuantity, wdRefType, wdNotes, createWithdrawal, t, resetToIdle])

  const handleStorno = React.useCallback(async () => {
    if (!selectedMovementId) return
    try {
      await cancelWithdrawal.mutateAsync({ movementId: selectedMovementId })
      setState('BOOKED')
      toast.success(t('stornoSuccess'))
      const updated = addHistoryEntry({
        timestamp: new Date().toISOString(),
        articleNumber: article!.number,
        articleName: article!.name,
        action: 'storno',
        success: true,
      })
      setHistory(updated)
      navigator.vibrate?.(200)
      setTimeout(resetToIdle, 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler'
      toast.error(message)
    }
  }, [selectedMovementId, cancelWithdrawal, article, t, resetToIdle])

  const handleScanError = React.useCallback(
    (error: string) => {
      toast.error(error)
    },
    []
  )

  // --- Render ---

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {state !== 'IDLE' && (
          <Button variant="ghost" size="icon" onClick={resetToIdle} className="h-10 w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex items-center gap-2">
          <ScanLine className="h-6 w-6" />
          <h1 className="text-xl font-bold">{t('pageTitle')}</h1>
        </div>
      </div>

      {/* State: IDLE -- Scanner active */}
      {state === 'IDLE' && (
        <>
          <QrScanner
            onScan={handleScan}
            onManualInput={handleManualInput}
            onError={handleScanError}
            enabled={scannerEnabled}
          />
          <p className="text-center text-sm text-muted-foreground">
            {t('scannerDescription')}
          </p>
        </>
      )}

      {/* State: SCANNED -- Article info + action buttons */}
      {state === 'SCANNED' && article && (
        <>
          {/* Article Info Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-mono text-sm text-muted-foreground">{article.number}</p>
                  <p className="text-lg font-semibold">{article.name}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {t('currentStock')}: {article.currentStock ?? 0} {article.unit}
                    </Badge>
                    {article.warehouseLocation && (
                      <Badge variant="outline">
                        <MapPin className="mr-1 h-3 w-3" />
                        {article.warehouseLocation}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action buttons 2x2 grid */}
          <div className="grid grid-cols-2 gap-3">
            <Card
              className="cursor-pointer transition-colors hover:bg-green-50 dark:hover:bg-green-950/20"
              onClick={() => setState('GOODS_RECEIPT')}
            >
              <CardContent className="flex flex-col items-center gap-2 p-4">
                <PackageCheck className="h-8 w-8 text-green-600" />
                <span className="text-sm font-medium">{t('actionGoodsReceipt')}</span>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-colors hover:bg-orange-50 dark:hover:bg-orange-950/20"
              onClick={() => setState('WITHDRAWAL')}
            >
              <CardContent className="flex flex-col items-center gap-2 p-4">
                <PackageMinus className="h-8 w-8 text-orange-600" />
                <span className="text-sm font-medium">{t('actionWithdrawal')}</span>
              </CardContent>
            </Card>

            <Card className="cursor-not-allowed opacity-50">
              <CardContent className="flex flex-col items-center gap-2 p-4">
                <ClipboardList className="h-8 w-8 text-blue-600" />
                <span className="text-sm font-medium">{t('actionInventory')}</span>
                <span className="text-xs text-muted-foreground">{t('inventoryNotAvailable')}</span>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
              onClick={() => setState('STORNO')}
            >
              <CardContent className="flex flex-col items-center gap-2 p-4">
                <Undo2 className="h-8 w-8 text-red-600" />
                <span className="text-sm font-medium">{t('actionStorno')}</span>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* State: GOODS_RECEIPT -- Select PO position + enter quantity */}
      {state === 'GOODS_RECEIPT' && article && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('actionGoodsReceipt')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {article.number} - {article.name}
            </p>

            {/* PO Position selection */}
            <div>
              <label className="mb-2 block text-sm font-medium">{t('selectPurchaseOrder')}</label>
              {!pendingPositions || pendingPositions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noPendingOrders')}</p>
              ) : (
                <div className="space-y-2">
                  {pendingPositions.map((pos) => {
                    const remaining = (pos.quantity ?? 0) - (pos.receivedQuantity ?? 0)
                    return (
                      <Card
                        key={pos.id}
                        className={`cursor-pointer p-3 transition-colors ${selectedPositionId === pos.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                        onClick={() => {
                          setSelectedPositionId(pos.id)
                          setGrQuantity(String(remaining))
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{pos.purchaseOrder.number}</p>
                            <p className="text-sm text-muted-foreground">
                              {pos.purchaseOrder.supplier?.company ?? '-'}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {t('remainingQty')}: {remaining} {article.unit}
                          </Badge>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quantity input */}
            {selectedPositionId && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium">{t('quantity')}</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={grQuantity}
                    onChange={(e) => setGrQuantity(e.target.value)}
                    className="h-14 text-2xl text-center"
                    min={0}
                    step="any"
                    autoFocus
                  />
                </div>

                <Button
                  className="h-14 w-full text-lg"
                  onClick={handleBookGoodsReceipt}
                  disabled={!grQuantity || parseFloat(grQuantity) <= 0 || bookSingleGR.isPending}
                >
                  {bookSingleGR.isPending ? '...' : t('confirm')}
                </Button>
              </>
            )}

            <Button variant="ghost" className="w-full" onClick={() => setState('SCANNED')}>
              {t('back')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* State: WITHDRAWAL -- Enter quantity + reference */}
      {state === 'WITHDRAWAL' && article && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('actionWithdrawal')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {article.number} - {article.name}
              </p>
              <Badge variant="outline">
                {t('currentStock')}: {article.currentStock ?? 0} {article.unit}
              </Badge>
            </div>

            {/* Quantity */}
            <div>
              <label className="mb-2 block text-sm font-medium">{t('quantity')}</label>
              <Input
                type="number"
                inputMode="decimal"
                value={wdQuantity}
                onChange={(e) => setWdQuantity(e.target.value)}
                className="h-14 text-2xl text-center"
                min={0}
                step="any"
                autoFocus
              />
            </div>

            {/* Reference type */}
            <div>
              <label className="mb-2 block text-sm font-medium">{t('referenceType')}</label>
              <div className="grid grid-cols-3 gap-2">
                {(['ORDER', 'DOCUMENT', 'NONE'] as const).map((type) => (
                  <Button
                    key={type}
                    variant={wdRefType === type ? 'default' : 'outline'}
                    className="h-12"
                    onClick={() => setWdRefType(type)}
                  >
                    {type === 'ORDER' ? t('referenceOrder') : type === 'DOCUMENT' ? t('referenceDocument') : t('referenceNone')}
                  </Button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <Input
              placeholder="Notiz (optional)"
              value={wdNotes}
              onChange={(e) => setWdNotes(e.target.value)}
            />

            <Button
              className="h-14 w-full text-lg"
              onClick={handleBookWithdrawal}
              disabled={!wdQuantity || parseFloat(wdQuantity) <= 0 || createWithdrawal.isPending}
            >
              {createWithdrawal.isPending ? '...' : t('confirm')}
            </Button>

            <Button variant="ghost" className="w-full" onClick={() => setState('SCANNED')}>
              {t('back')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* State: STORNO -- Select movement to cancel */}
      {state === 'STORNO' && article && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('actionStorno')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {article.number} - {article.name}
            </p>

            <div>
              <label className="mb-2 block text-sm font-medium">{t('selectMovement')}</label>
              {!recentMovements || recentMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noMovements')}</p>
              ) : (
                <div className="space-y-2">
                  {recentMovements.map((mv) => (
                    <Card
                      key={mv.id}
                      className={`cursor-pointer p-3 transition-colors ${selectedMovementId === mv.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => setSelectedMovementId(mv.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <Badge variant={mv.quantity < 0 ? 'destructive' : 'default'} className="mb-1">
                            {mv.type}
                          </Badge>
                          <p className="text-sm">
                            {mv.quantity > 0 ? '+' : ''}{mv.quantity} {article.unit}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(mv.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {selectedMovementId && (
              <Button
                className="h-14 w-full text-lg"
                variant="destructive"
                onClick={handleStorno}
                disabled={cancelWithdrawal.isPending}
              >
                {cancelWithdrawal.isPending ? '...' : t('confirmStorno')}
              </Button>
            )}

            <Button variant="ghost" className="w-full" onClick={() => setState('SCANNED')}>
              {t('back')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* State: BOOKED -- Success */}
      {state === 'BOOKED' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <p className="text-xl font-semibold">{t('success')}</p>
            <Button variant="outline" onClick={resetToIdle}>
              {t('scannerTitle')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Scan History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('scanHistory')}</CardTitle>
          </CardHeader>
          <CardContent className="max-h-48 overflow-y-auto p-2">
            <div className="space-y-1">
              {history.slice(0, 20).map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className={entry.success ? 'text-green-600' : 'text-red-600'}>
                      {entry.success ? '\u2713' : '\u2717'}
                    </span>
                    <span className="font-mono">{entry.articleNumber}</span>
                    <span className="text-muted-foreground">{entry.articleName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {entry.quantity && <span>{entry.quantity}</span>}
                    <Badge variant="outline" className="text-[10px]">
                      {entry.action}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

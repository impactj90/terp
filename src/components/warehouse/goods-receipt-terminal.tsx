'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronRight, Package } from 'lucide-react'
import {
  useWhPendingOrders,
  useWhOrderPositions,
  useBookGoodsReceipt,
} from '@/hooks/use-wh-stock-movements'
import { GoodsReceiptPositionRow } from './goods-receipt-position-row'

type Step = 1 | 2 | 3 | 4

interface ReceiveState {
  step: Step
  supplierId: string | undefined
  purchaseOrderId: string | undefined
  receiveQuantities: Map<string, number>
}

const STEPS = [
  { num: 1, key: 'stepSupplier' },
  { num: 2, key: 'stepOrder' },
  { num: 3, key: 'stepPositions' },
  { num: 4, key: 'stepConfirm' },
] as const

export function GoodsReceiptTerminal() {
  const t = useTranslations('warehouseGoodsReceipt')

  const [state, setState] = React.useState<ReceiveState>({
    step: 1,
    supplierId: undefined,
    purchaseOrderId: undefined,
    receiveQuantities: new Map(),
  })

  const { data: pendingOrders, isLoading: loadingOrders } = useWhPendingOrders(
    state.supplierId
  )

  const { data: orderDetail, isLoading: loadingPositions } = useWhOrderPositions(
    state.purchaseOrderId || '',
    !!state.purchaseOrderId && state.step >= 3
  )

  const bookMutation = useBookGoodsReceipt()

  // Extract unique suppliers from pending orders
  const suppliers = React.useMemo(() => {
    if (!pendingOrders) return []
    const map = new Map<string, { id: string; company: string | null }>()
    for (const po of pendingOrders) {
      if (po.supplier && !map.has(po.supplier.id)) {
        map.set(po.supplier.id, { id: po.supplier.id, company: po.supplier.company })
      }
    }
    return Array.from(map.values())
  }, [pendingOrders])

  const setStep = (step: Step) => setState((s) => ({ ...s, step }))

  const selectSupplier = (supplierId: string | undefined) => {
    setState((s) => ({
      ...s,
      supplierId,
      purchaseOrderId: undefined,
      receiveQuantities: new Map(),
      step: 2,
    }))
  }

  const selectOrder = (purchaseOrderId: string) => {
    setState((s) => ({
      ...s,
      purchaseOrderId,
      receiveQuantities: new Map(),
      step: 3,
    }))
  }

  const setQuantity = (positionId: string, quantity: number) => {
    setState((s) => {
      const map = new Map(s.receiveQuantities)
      if (quantity > 0) {
        map.set(positionId, quantity)
      } else {
        map.delete(positionId)
      }
      return { ...s, receiveQuantities: map }
    })
  }

  const receiveAll = () => {
    if (!orderDetail?.positions) return
    setState((s) => {
      const map = new Map<string, number>()
      for (const pos of orderDetail.positions) {
        // Only ARTICLE positions can receive goods
        if (pos.positionType !== "ARTICLE") continue
        const remaining = (pos.quantity ?? 0) - pos.receivedQuantity
        if (remaining > 0) {
          map.set(pos.id, remaining)
        }
      }
      return { ...s, receiveQuantities: map }
    })
  }

  const clearAll = () => {
    setState((s) => ({ ...s, receiveQuantities: new Map() }))
  }

  const positionsToBook = React.useMemo(() => {
    const entries: Array<{ positionId: string; quantity: number }> = []
    for (const [positionId, quantity] of state.receiveQuantities) {
      if (quantity > 0) {
        entries.push({ positionId, quantity })
      }
    }
    return entries
  }, [state.receiveQuantities])

  const handleBook = async () => {
    if (!state.purchaseOrderId || positionsToBook.length === 0) return

    try {
      await bookMutation.mutateAsync({
        purchaseOrderId: state.purchaseOrderId,
        positions: positionsToBook,
      })
      toast.success(t('toastBooked'))
      // Reset to step 1
      setState({
        step: 1,
        supplierId: undefined,
        purchaseOrderId: undefined,
        receiveQuantities: new Map(),
      })
    } catch {
      toast.error(t('toastError'))
    }
  }

  const reset = () => {
    setState({
      step: 1,
      supplierId: undefined,
      purchaseOrderId: undefined,
      receiveQuantities: new Map(),
    })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map(({ num, key }, idx) => (
          <React.Fragment key={num}>
            {idx > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                state.step === num
                  ? 'bg-primary text-primary-foreground'
                  : state.step > num
                    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-700/10'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {state.step > num ? (
                <Check className="h-4 w-4" />
              ) : (
                <span className="font-mono">{num}</span>
              )}
              <span>{t(key as Parameters<typeof t>[0])}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Select Supplier */}
      {state.step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('stepSupplier')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !pendingOrders?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('noPendingOrders')}
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => selectSupplier(undefined)}
                >
                  <Package className="h-4 w-4 mr-2" />
                  {t('allSuppliers')} ({pendingOrders.length})
                </Button>
                {suppliers.map((supplier) => {
                  const count = pendingOrders.filter(
                    (po) => po.supplier?.id === supplier.id
                  ).length
                  return (
                    <Button
                      key={supplier.id}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => selectSupplier(supplier.id)}
                    >
                      <Package className="h-4 w-4 mr-2" />
                      {supplier.company || '---'} ({count})
                    </Button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select Order */}
      {state.step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('stepOrder')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !pendingOrders?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                {state.supplierId
                  ? t('noPendingOrdersForSupplier')
                  : t('noPendingOrders')}
              </div>
            ) : (
              <div className="space-y-2">
                {pendingOrders.map((po) => (
                  <Button
                    key={po.id}
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => selectOrder(po.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold">{po.number}</span>
                      <span className="text-muted-foreground">
                        {po.supplier?.company || '---'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={po.status === 'PARTIALLY_RECEIVED' ? 'yellow' : 'blue'}
                      >
                        {po.status === 'PARTIALLY_RECEIVED' ? 'Teillieferung' : 'Bestellt'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {po._count?.positions || 0} Pos.
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            )}
            <div className="mt-4">
              <Button variant="ghost" onClick={reset}>
                {t('actionBack')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Position quantities */}
      {state.step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('stepPositions')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPositions ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !orderDetail?.positions?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('errorNoPositions')}
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-4">
                  <Button variant="outline" size="sm" onClick={receiveAll}>
                    {t('receiveAll')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    {t('clearAll')}
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('colArticleNumber')}</TableHead>
                      <TableHead>{t('colArticle')}</TableHead>
                      <TableHead className="text-right">{t('colOrdered')}</TableHead>
                      <TableHead className="text-right">{t('colAlreadyReceived')}</TableHead>
                      <TableHead className="text-right">{t('colRemaining')}</TableHead>
                      <TableHead>{t('colReceiveNow')}</TableHead>
                      <TableHead>{t('colUnit')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderDetail.positions
                      .filter((pos) => pos.positionType === "ARTICLE" && pos.article != null)
                      .map((pos) => (
                      <GoodsReceiptPositionRow
                        key={pos.id}
                        position={{
                          id: pos.id,
                          articleId: pos.articleId!,
                          article: pos.article!,
                          quantity: pos.quantity ?? 0,
                          receivedQuantity: pos.receivedQuantity,
                        }}
                        receiveQuantity={state.receiveQuantities.get(pos.id) || 0}
                        onQuantityChange={setQuantity}
                      />
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                {t('actionBack')}
              </Button>
              <Button
                disabled={positionsToBook.length === 0}
                onClick={() => setStep(4)}
              >
                {t('actionNext')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Confirmation */}
      {state.step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('confirmTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{t('confirmDescription')}</p>

            <div className="mb-2 text-sm font-medium">
              {t('confirmOrder')}: <span className="font-mono">{orderDetail?.number}</span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('confirmArticle')}</TableHead>
                  <TableHead className="text-right">{t('confirmQuantity')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positionsToBook.map((entry) => {
                  const pos = orderDetail?.positions?.find((p) => p.id === entry.positionId)
                  return (
                    <TableRow key={entry.positionId}>
                      <td className="p-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {pos?.article?.number}
                        </span>
                        <span className="ml-2">{pos?.article?.name}</span>
                      </td>
                      <td className="p-2 text-right font-mono text-green-600">
                        +{entry.quantity}
                      </td>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className="mt-6 flex gap-2">
              <Button variant="ghost" onClick={() => setStep(3)}>
                {t('actionBack')}
              </Button>
              <Button
                onClick={handleBook}
                disabled={bookMutation.isPending}
              >
                {bookMutation.isPending ? t('loading') : t('confirmBook')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

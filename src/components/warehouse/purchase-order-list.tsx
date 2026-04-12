'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MoreHorizontal, Eye, Edit, Trash2, Send, XCircle, Plus, Lightbulb } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PurchaseOrderStatusBadge } from './purchase-order-status-badge'
import {
  useWhPurchaseOrders,
  useDeleteWhPurchaseOrder,
  useCancelWhPurchaseOrder,
} from '@/hooks/use-wh-purchase-orders'
import { toast } from 'sonner'

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return '\u2014'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(price)
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '\u2014'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

type PurchaseOrderStatus = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'

export function PurchaseOrderList() {
  const t = useTranslations('warehousePurchaseOrders')
  const router = useRouter()

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL')
  const [page, setPage] = React.useState(1)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; number: string } | null>(null)
  const [cancelTarget, setCancelTarget] = React.useState<{ id: string; number: string } | null>(null)

  const { data, isLoading } = useWhPurchaseOrders({
    search: search || undefined,
    status: statusFilter !== 'ALL' ? statusFilter as PurchaseOrderStatus : undefined,
    page,
    pageSize: 25,
  })

  const deleteMutation = useDeleteWhPurchaseOrder()
  const cancelMutation = useCancelWhPurchaseOrder()

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id })
      toast.success(t('toastDeleted'))
      setDeleteTarget(null)
    } catch {
      toast.error('Error')
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    try {
      await cancelMutation.mutateAsync({ id: cancelTarget.id })
      toast.success(t('toastCancelled'))
      setCancelTarget(null)
    } catch {
      toast.error('Error')
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full sm:w-64"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t('filterAllStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('filterAllStatuses')}</SelectItem>
            <SelectItem value="DRAFT">{t('statusDraft')}</SelectItem>
            <SelectItem value="ORDERED">{t('statusOrdered')}</SelectItem>
            <SelectItem value="PARTIALLY_RECEIVED">{t('statusPartiallyReceived')}</SelectItem>
            <SelectItem value="RECEIVED">{t('statusReceived')}</SelectItem>
            <SelectItem value="CANCELLED">{t('statusCancelled')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="hidden sm:block flex-1" />
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-initial sm:size-default"
            onClick={() => router.push('/warehouse/purchase-orders/suggestions')}
          >
            <Lightbulb className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{t('suggestionsTitle')}</span>
            <span className="sm:hidden">{t('suggestionsTitle')}</span>
          </Button>
          <Button size="sm" className="flex-1 sm:flex-initial sm:size-default" onClick={() => router.push('/warehouse/purchase-orders/new')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('actionCreate')}
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data?.items?.length ? (
        <div className="text-center py-8 text-muted-foreground">
          {t('noPurchaseOrdersFound')}
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="divide-y sm:hidden">
            {data.items.map((order) => (
              <div
                key={order.id}
                className="p-3 active:bg-muted/50 cursor-pointer"
                onClick={() => router.push(`/warehouse/purchase-orders/${order.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium">{order.number}</span>
                      <PurchaseOrderStatusBadge status={order.status as PurchaseOrderStatus} />
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {(order.supplier as { company: string })?.company ?? '\u2014'}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-medium">{formatPrice(order.totalGross)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(order.orderDate)}</p>
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
                  <TableHead className="w-[100px]">{t('colNumber')}</TableHead>
                  <TableHead>{t('colSupplier')}</TableHead>
                  <TableHead className="w-[120px]">{t('colOrderDate')}</TableHead>
                  <TableHead className="w-[120px]">{t('colDeliveryDate')}</TableHead>
                  <TableHead className="w-[150px]">{t('colStatus')}</TableHead>
                  <TableHead className="w-[100px] text-right">{t('colTotal')}</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/warehouse/purchase-orders/${order.id}`)}
                  >
                    <TableCell className="font-mono text-sm">{order.number}</TableCell>
                    <TableCell className="font-medium">
                      {(order.supplier as { company: string })?.company ?? '\u2014'}
                    </TableCell>
                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                    <TableCell>{formatDate(order.requestedDelivery)}</TableCell>
                    <TableCell>
                      <PurchaseOrderStatusBadge status={order.status as PurchaseOrderStatus} />
                    </TableCell>
                    <TableCell className="text-right">{formatPrice(order.totalGross)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Aktionen</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/warehouse/purchase-orders/${order.id}`)
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            {t('actionView')}
                          </DropdownMenuItem>
                          {order.status === 'DRAFT' && (
                            <>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/warehouse/purchase-orders/${order.id}`)
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                {t('actionEdit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/warehouse/purchase-orders/${order.id}`)
                                }}
                              >
                                <Send className="h-4 w-4 mr-2" />
                                {t('actionSendOrder')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteTarget({ id: order.id, number: order.number })
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t('actionDelete')}
                              </DropdownMenuItem>
                            </>
                          )}
                          {(order.status === 'DRAFT' || order.status === 'ORDERED') && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                setCancelTarget({ id: order.id, number: order.number })
                              }}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              {t('actionCancel')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data.total > 25 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                &laquo;
              </Button>
              <span className="flex items-center text-xs sm:text-sm text-muted-foreground">
                {page} / {Math.ceil(data.total / 25)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(data.total / 25)}
                onClick={() => setPage(page + 1)}
              >
                &raquo;
              </Button>
            </div>
          )}
        </>
      )}

      {/* Delete Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('deleteDialogTitle')}
        description={t('deleteDialogDescription', { number: deleteTarget?.number ?? '' })}
        confirmLabel={t('deleteDialogConfirm')}
        cancelLabel={t('cancel')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      {/* Cancel Dialog */}
      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title={t('cancelDialogTitle')}
        description={t('cancelDialogDescription', { number: cancelTarget?.number ?? '' })}
        confirmLabel={t('cancelDialogConfirm')}
        cancelLabel={t('cancel')}
        variant="destructive"
        isLoading={cancelMutation.isPending}
        onConfirm={handleCancel}
      />
    </div>
  )
}

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MoreHorizontal, Eye, Edit, XCircle, Plus, CreditCard } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SupplierInvoiceStatusBadge } from './supplier-invoice-status-badge'
import {
  useWhSupplierInvoices,
  useCancelWhSupplierInvoice,
  useWhSupplierInvoiceSummary,
} from '@/hooks/use-wh-supplier-invoices'
import { SupplierInvoiceFormSheet } from './supplier-invoice-form-sheet'
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

type InvoiceStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'CANCELLED'

export function SupplierInvoiceList() {
  const t = useTranslations('warehouseSupplierInvoices')
  const router = useRouter()

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL')
  const [page, setPage] = React.useState(1)
  const [cancelTarget, setCancelTarget] = React.useState<{ id: string; number: string } | null>(null)
  const [showCreateSheet, setShowCreateSheet] = React.useState(false)

  const { data, isLoading } = useWhSupplierInvoices({
    search: search || undefined,
    status: statusFilter !== 'ALL' ? statusFilter as InvoiceStatus : undefined,
    page,
    pageSize: 25,
  })

  const { data: summaryData } = useWhSupplierInvoiceSummary()

  const cancelMutation = useCancelWhSupplierInvoice()

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
      {/* Summary Cards */}
      {summaryData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                {t('summaryTotalOpen')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <p className="text-lg sm:text-2xl font-bold">{formatPrice(summaryData.totalOpen)}</p>
              <p className="text-xs text-muted-foreground">
                {summaryData.invoiceCount} {t('summaryInvoiceCount')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-destructive">
                {t('summaryTotalOverdue')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <p className="text-lg sm:text-2xl font-bold text-destructive">{formatPrice(summaryData.totalOverdue)}</p>
              <p className="text-xs text-muted-foreground">
                {summaryData.overdueCount} {t('filterOverdue')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                {t('summaryPaidThisMonth')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <p className="text-lg sm:text-2xl font-bold">{formatPrice(summaryData.totalPaidThisMonth)}</p>
            </CardContent>
          </Card>
        </div>
      )}

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
            <SelectItem value="OPEN">{t('statusOpen')}</SelectItem>
            <SelectItem value="PARTIAL">{t('statusPartial')}</SelectItem>
            <SelectItem value="PAID">{t('statusPaid')}</SelectItem>
            <SelectItem value="CANCELLED">{t('statusCancelled')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="hidden sm:block flex-1" />
        <Button size="sm" className="w-full sm:w-auto sm:size-default" onClick={() => setShowCreateSheet(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('actionCreate')}
        </Button>
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
          {t('noInvoicesFound')}
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="divide-y sm:hidden">
            {data.items.map((invoice) => (
              <div
                key={invoice.id}
                className="p-3 active:bg-muted/50 cursor-pointer"
                onClick={() => router.push(`/warehouse/supplier-invoices/${invoice.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium">{invoice.number}</span>
                      <SupplierInvoiceStatusBadge status={invoice.status as InvoiceStatus} />
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {(invoice.supplier as { company: string })?.company ?? '\u2014'}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-medium">{formatPrice(invoice.totalGross)}</p>
                    {invoice.openAmount > 0 && (
                      <p className={`text-xs ${invoice.isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        {formatPrice(invoice.openAmount)}
                      </p>
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
                  <TableHead className="w-[120px]">{t('colNumber')}</TableHead>
                  <TableHead>{t('colSupplier')}</TableHead>
                  <TableHead className="w-[120px]">{t('colInvoiceDate')}</TableHead>
                  <TableHead className="w-[120px]">{t('colDueDate')}</TableHead>
                  <TableHead className="w-[120px] text-right">{t('colTotalGross')}</TableHead>
                  <TableHead className="w-[120px] text-right">{t('colOpenAmount')}</TableHead>
                  <TableHead className="w-[150px]">{t('colStatus')}</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/warehouse/supplier-invoices/${invoice.id}`)}
                  >
                    <TableCell className="font-mono text-sm">{invoice.number}</TableCell>
                    <TableCell className="font-medium">
                      {(invoice.supplier as { company: string })?.company ?? '\u2014'}
                    </TableCell>
                    <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell className={invoice.isOverdue ? 'text-destructive font-medium' : ''}>
                      {formatDate(invoice.dueDate)}
                    </TableCell>
                    <TableCell className="text-right">{formatPrice(invoice.totalGross)}</TableCell>
                    <TableCell className={`text-right ${invoice.openAmount > 0 ? 'font-medium' : ''}`}>
                      {formatPrice(invoice.openAmount)}
                    </TableCell>
                    <TableCell>
                      <SupplierInvoiceStatusBadge status={invoice.status as InvoiceStatus} />
                    </TableCell>
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
                              router.push(`/warehouse/supplier-invoices/${invoice.id}`)
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            {t('actionView')}
                          </DropdownMenuItem>
                          {invoice.status === 'OPEN' && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/warehouse/supplier-invoices/${invoice.id}`)
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              {t('actionEdit')}
                            </DropdownMenuItem>
                          )}
                          {(invoice.status === 'OPEN' || invoice.status === 'PARTIAL') && (
                            <>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/warehouse/supplier-invoices/${invoice.id}`)
                                }}
                              >
                                <CreditCard className="h-4 w-4 mr-2" />
                                {t('actionRecordPayment')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCancelTarget({ id: invoice.id, number: invoice.number })
                                }}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                {t('actionCancel')}
                              </DropdownMenuItem>
                            </>
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
            <div className="flex items-center justify-between px-2">
              <p className="text-xs sm:text-sm text-muted-foreground">
                {data.total} {t('summaryInvoiceCount')}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  &larr;
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * 25 >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  &rarr;
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Cancel Dialog */}
      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => { if (!open) setCancelTarget(null) }}
        title={t('cancelConfirmTitle')}
        description={t('cancelConfirmMessage')}
        onConfirm={handleCancel}
        isLoading={cancelMutation.isPending}
      />

      {/* Create Sheet */}
      <SupplierInvoiceFormSheet
        open={showCreateSheet}
        onOpenChange={setShowCreateSheet}
      />
    </div>
  )
}

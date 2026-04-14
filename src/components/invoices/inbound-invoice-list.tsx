'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Plus, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { InboundInvoiceStatusBadge } from './inbound-invoice-status-badge'
import { InboundInvoicePaymentStatusBadge } from './inbound-invoice-payment-status-badge'
import { InboundInvoiceUploadDialog } from './inbound-invoice-upload-dialog'
import {
  useInboundInvoices, useCancelInboundInvoice, useRemoveInboundInvoice,
} from '@/hooks/useInboundInvoices'

const PAGE_SIZE = 25

const STATUS_FILTER_KEYS = [
  { value: 'ALL', key: 'list.allStatuses' },
  { value: 'DRAFT', key: 'status.draft' },
  { value: 'PENDING_APPROVAL', key: 'status.pendingApproval' },
  { value: 'APPROVED', key: 'status.approved' },
  { value: 'REJECTED', key: 'status.rejected' },
  { value: 'EXPORTED', key: 'status.exported' },
  { value: 'CANCELLED', key: 'status.cancelled' },
] as const

const formatDate = (d: string | Date | null | undefined) => {
  if (!d) return '—'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
}

const formatPrice = (v: number | string | null | undefined) => {
  if (v == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(v))
}

export function InboundInvoiceList() {
  const t = useTranslations('inboundInvoices')
  const locale = useLocale()
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('ALL')
  const [page, setPage] = React.useState(1)
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = React.useState<string | null>(null)

  const cancelMutation = useCancelInboundInvoice()
  const removeMutation = useRemoveInboundInvoice()

  const { data, isLoading } = useInboundInvoices({
    search: search || undefined,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={t('list.searchPlaceholder')}
          className="max-w-xs"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_KEYS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.key as Parameters<typeof t>[0])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> {t('list.uploadButton')}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && data && data.items.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {t('list.emptyState')}
        </div>
      )}

      {/* Mobile cards */}
      {!isLoading && data && data.items.length > 0 && (
        <div className="divide-y sm:hidden">
          {data.items.map((inv) => (
            <div
              key={inv.id}
              className="cursor-pointer px-1 py-3"
              onClick={() => router.push(`/${locale}/invoices/inbound/${inv.id}`)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{inv.number}</span>
                <InboundInvoiceStatusBadge status={inv.status} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {(inv.supplier as { company?: string } | null)?.company ?? inv.sellerName ?? '—'} · {inv.invoiceNumber ?? '—'} · {formatPrice(inv.totalGross)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop table */}
      {!isLoading && data && data.items.length > 0 && (
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('list.colNumber')}</TableHead>
                <TableHead>{t('list.colSupplier')}</TableHead>
                <TableHead>{t('list.colInvoiceNumber')}</TableHead>
                <TableHead>{t('list.colDate')}</TableHead>
                <TableHead className="text-right">{t('list.colAmount')}</TableHead>
                <TableHead>{t('list.colStatus')}</TableHead>
                <TableHead>{t('list.colPaymentStatus')}</TableHead>
                <TableHead>{t('list.colSource')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((inv) => (
                <TableRow
                  key={inv.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/${locale}/invoices/inbound/${inv.id}`)}
                >
                  <TableCell className="font-medium">{inv.number}</TableCell>
                  <TableCell>{(inv.supplier as { company?: string } | null)?.company ?? inv.sellerName ?? '—'}</TableCell>
                  <TableCell>{inv.invoiceNumber ?? '—'}</TableCell>
                  <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                  <TableCell className="text-right">{formatPrice(inv.totalGross)}</TableCell>
                  <TableCell><InboundInvoiceStatusBadge status={inv.status} /></TableCell>
                  <TableCell>
                    <InboundInvoicePaymentStatusBadge
                      status={(inv as { paymentStatus?: string }).paymentStatus ?? 'UNPAID'}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{inv.source}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {inv.status === 'DRAFT' && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDeleteTarget(inv.id) }}>
                            {t('list.deleteAction')}
                          </DropdownMenuItem>
                        )}
                        {['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(inv.status) && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setCancelTarget(inv.id) }}>
                            {t('list.cancelAction')}
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
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            &laquo;
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            &raquo;
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <InboundInvoiceUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open: boolean) => { if (!open) setDeleteTarget(null) }}
        title={t('list.deleteTitle')}
        description={t('list.deleteDescription')}
        variant="destructive"
        isLoading={removeMutation.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await removeMutation.mutateAsync({ id: deleteTarget })
            toast.success(t('list.deleteSuccess'))
            setDeleteTarget(null)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t('list.deleteError'))
          }
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open: boolean) => { if (!open) setCancelTarget(null) }}
        title={t('list.cancelTitle')}
        description={t('list.cancelDescription')}
        variant="destructive"
        isLoading={cancelMutation.isPending}
        onConfirm={async () => {
          if (!cancelTarget) return
          try {
            await cancelMutation.mutateAsync({ id: cancelTarget })
            toast.success(t('list.cancelSuccess'))
            setCancelTarget(null)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t('list.cancelError'))
          }
        }}
      />
    </div>
  )
}

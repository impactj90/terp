'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useBillingOpenItems } from '@/hooks'
import { PaymentStatusBadge } from './payment-status-badge'
import { OpenItemsSummaryCard } from './open-items-summary-card'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

function formatDate(date: string | Date | null): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

export function OpenItemList() {
  const router = useRouter()
  const t = useTranslations('billingOpenItems')
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useBillingOpenItems({
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter as "open" : undefined,
    page,
    pageSize: 25,
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('title')}</h2>
      </div>

      {/* Summary */}
      <OpenItemsSummaryCard />

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatuses')}</SelectItem>
            <SelectItem value="open">{t('statusOpen')}</SelectItem>
            <SelectItem value="partial">{t('statusPartial')}</SelectItem>
            <SelectItem value="paid">{t('statusPaid')}</SelectItem>
            <SelectItem value="overdue">{t('statusOverdue')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columnInvoiceNumber')}</TableHead>
            <TableHead>{t('columnCustomer')}</TableHead>
            <TableHead>{t('columnInvoiceDate')}</TableHead>
            <TableHead>{t('columnDueDate')}</TableHead>
            <TableHead className="text-right">{t('columnGross')}</TableHead>
            <TableHead className="text-right">{t('columnPaid')}</TableHead>
            <TableHead className="text-right">{t('columnOpen')}</TableHead>
            <TableHead>{t('columnStatus')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                {t('loading')}
              </TableCell>
            </TableRow>
          ) : !data?.items?.length ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                {t('noOpenItemsFound')}
              </TableCell>
            </TableRow>
          ) : (
            data.items.map((item: Record<string, unknown>) => {
              const doc = item as Record<string, unknown> & {
                id: string
                number: string
                documentDate: string | Date
                totalGross: number
                address?: { company?: string }
                paidAmount: number
                openAmount: number
                paymentStatus: string
                dueDate: string | Date | null
                isOverdue: boolean
              }
              return (
                <TableRow
                  key={doc.id}
                  className={`cursor-pointer hover:bg-muted/50 ${doc.isOverdue ? 'bg-red-50 dark:bg-red-950/40' : ''}`}
                  onClick={() => router.push(`/orders/open-items/${doc.id}`)}
                >
                  <TableCell className="font-medium">{doc.number}</TableCell>
                  <TableCell>{doc.address?.company ?? '-'}</TableCell>
                  <TableCell>{formatDate(doc.documentDate)}</TableCell>
                  <TableCell>{formatDate(doc.dueDate)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(doc.totalGross)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(doc.paidAmount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(doc.openAmount)}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={doc.paymentStatus} isOverdue={doc.isOverdue} />
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {data && data.total > 25 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('totalInvoices', { count: data.total })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t('previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 25 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

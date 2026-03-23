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
import { Plus, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useBillingServiceCases } from '@/hooks'
import { ServiceCaseStatusBadge } from './service-case-status-badge'
import { ServiceCaseFormSheet } from './service-case-form-sheet'

function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

interface ServiceCaseListProps {
  addressId?: string
}

export function ServiceCaseList({ addressId }: ServiceCaseListProps) {
  const router = useRouter()
  const t = useTranslations('billingServiceCases')
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  const { data, isLoading } = useBillingServiceCases({
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter as "OPEN" : undefined,
    addressId,
    page,
    pageSize: 25,
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('title')}</h2>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('newServiceCase')}
        </Button>
      </div>

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
            <SelectItem value="OPEN">{t('statusOpen')}</SelectItem>
            <SelectItem value="IN_PROGRESS">{t('statusInProgress')}</SelectItem>
            <SelectItem value="CLOSED">{t('statusClosed')}</SelectItem>
            <SelectItem value="INVOICED">{t('statusInvoiced')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columnNumber')}</TableHead>
            <TableHead>{t('columnTitle')}</TableHead>
            <TableHead>{t('columnCustomer')}</TableHead>
            <TableHead>{t('columnAssignedTo')}</TableHead>
            <TableHead>{t('columnStatus')}</TableHead>
            <TableHead>{t('columnReportedAt')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t('loading')}
              </TableCell>
            </TableRow>
          ) : !data?.items?.length ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t('noServiceCasesFound')}
              </TableCell>
            </TableRow>
          ) : (
            data.items.map((sc) => (
              <TableRow
                key={sc.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/orders/service-cases/${sc.id}`)}
              >
                <TableCell className="font-medium">{sc.number}</TableCell>
                <TableCell>{sc.title}</TableCell>
                <TableCell>
                  {(sc as Record<string, unknown> & { address?: { company?: string } }).address?.company ?? '-'}
                </TableCell>
                <TableCell>
                  {(sc as Record<string, unknown> & { assignedTo?: { firstName?: string; lastName?: string } }).assignedTo
                    ? `${(sc as Record<string, unknown> & { assignedTo: { firstName: string; lastName: string } }).assignedTo.firstName} ${(sc as Record<string, unknown> & { assignedTo: { firstName: string; lastName: string } }).assignedTo.lastName}`
                    : '-'}
                </TableCell>
                <TableCell>
                  <ServiceCaseStatusBadge status={sc.status} />
                </TableCell>
                <TableCell>{formatDate(sc.reportedAt)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {data && data.total > 25 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('totalServiceCases', { count: data.total })}
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

      {/* Create Sheet */}
      <ServiceCaseFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        addressId={addressId}
      />
    </div>
  )
}

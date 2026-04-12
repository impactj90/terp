'use client'

import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { usePendingApprovals } from '@/hooks/useInboundInvoices'

const formatDate = (d: string | Date | null | undefined) => {
  if (!d) return '—'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
}

const formatPrice = (v: number | string | null | undefined) => {
  if (v == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(v))
}

export function InboundPendingApprovals() {
  const t = useTranslations('inboundInvoices')
  const locale = useLocale()
  const router = useRouter()
  const { data: approvals, isLoading } = usePendingApprovals()

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (!approvals || approvals.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {t('approval.emptyState')}
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('approval.colInvoiceNumber')}</TableHead>
          <TableHead>{t('approval.colSupplier')}</TableHead>
          <TableHead className="text-right">{t('approval.colAmount')}</TableHead>
          <TableHead>{t('approval.colDate')}</TableHead>
          <TableHead>{t('approval.colStep')}</TableHead>
          <TableHead>{t('approval.colDue')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {approvals.map((approval) => {
          const inv = approval.invoice as {
            id: string
            number: string
            invoiceNumber?: string | null
            totalGross?: unknown
            invoiceDate?: string | Date | null
            supplier?: { company?: string } | null
          }
          const isOverdue = approval.dueAt && new Date(approval.dueAt) < new Date()

          return (
            <TableRow
              key={approval.id}
              className="cursor-pointer"
              onClick={() => router.push(`/${locale}/invoices/inbound/${inv.id}`)}
            >
              <TableCell className="font-medium">
                {inv.invoiceNumber ?? inv.number}
              </TableCell>
              <TableCell>
                {inv.supplier?.company ?? '—'}
              </TableCell>
              <TableCell className="text-right">
                {formatPrice(inv.totalGross as number | null)}
              </TableCell>
              <TableCell>
                {formatDate(inv.invoiceDate)}
              </TableCell>
              <TableCell>
                {t('approval.stepLabel', { step: approval.stepOrder })}
              </TableCell>
              <TableCell>
                <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                  {formatDate(approval.dueAt)}
                </span>
                {isOverdue && (
                  <Badge variant="red" className="ml-1">
                    <Clock className="mr-0.5 h-3 w-3" /> {t('approval.overdue')}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

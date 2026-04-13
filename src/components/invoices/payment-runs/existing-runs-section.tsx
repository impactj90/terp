'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePaymentRuns } from '@/hooks/usePaymentRuns'
import { PaymentRunStatusBadge } from './payment-run-status-badge'

const formatDate = (d: string | Date | null | undefined) => {
  if (!d) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(d))
}

const formatCents = (cents: number | null | undefined) => {
  if (cents == null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

export function ExistingRunsSection() {
  const t = useTranslations('paymentRuns.existingRuns')
  const router = useRouter()
  const { data, isLoading } = usePaymentRuns()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('sectionTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.items.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {t('emptyState')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.number')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead>{t('columns.createdAt')}</TableHead>
                <TableHead>{t('columns.executionDate')}</TableHead>
                <TableHead className="text-right">
                  {t('columns.itemCount')}
                </TableHead>
                <TableHead className="text-right">
                  {t('columns.total')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((run) => (
                <TableRow
                  key={run.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/invoices/inbound/payment-runs/${run.id}`)
                  }
                >
                  <TableCell className="font-mono">{run.number}</TableCell>
                  <TableCell>
                    <PaymentRunStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>{formatDate(run.createdAt)}</TableCell>
                  <TableCell>{formatDate(run.executionDate)}</TableCell>
                  <TableCell className="text-right">{run.itemCount}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCents(run.totalAmountCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

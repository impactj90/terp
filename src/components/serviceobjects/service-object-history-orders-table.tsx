'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'

type OrderHistoryItem = {
  id: string
  code: string
  name: string
  status: string
  validFrom: Date | string | null
  validTo: Date | string | null
  createdAt: Date | string
  assignedEmployees: Array<{
    id: string
    firstName: string
    lastName: string
    personnelNumber: string
  }>
  summary: {
    totalMinutes: number
    bookingCount: number
    lastBookingDate: Date | string | null
  }
}

interface Props {
  items: OrderHistoryItem[]
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function formatHours(minutes: number): string {
  if (minutes === 0) return '0:00'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${m.toString().padStart(2, '0')}`
}

function renderTechnicians(
  employees: OrderHistoryItem['assignedEmployees']
): string {
  if (employees.length === 0) return '—'
  const names = employees.map((e) => `${e.firstName} ${e.lastName}`)
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

export function ServiceObjectHistoryOrdersTable({ items }: Props) {
  const t = useTranslations('serviceObjects.history')

  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        {t('emptyOrders')}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[110px]">{t('colCode')}</TableHead>
            <TableHead>{t('colName')}</TableHead>
            <TableHead className="w-[120px]">{t('colStatus')}</TableHead>
            <TableHead className="w-[110px]">{t('colValidFrom')}</TableHead>
            <TableHead className="w-[110px]">{t('colValidTo')}</TableHead>
            <TableHead>{t('colTechnicians')}</TableHead>
            <TableHead className="w-[80px] text-right">
              {t('colHours')}
            </TableHead>
            <TableHead className="w-[90px] text-right">
              {t('colBookings')}
            </TableHead>
            <TableHead className="w-[120px]">{t('colLastBooking')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-mono text-sm">{o.code}</TableCell>
              <TableCell className="text-sm">{o.name}</TableCell>
              <TableCell>
                <OrderStatusBadge status={o.status} />
              </TableCell>
              <TableCell className="text-sm">
                {formatDate(o.validFrom)}
              </TableCell>
              <TableCell className="text-sm">
                {formatDate(o.validTo)}
              </TableCell>
              <TableCell className="text-sm">
                {renderTechnicians(o.assignedEmployees)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatHours(o.summary.totalMinutes)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {o.summary.bookingCount}
              </TableCell>
              <TableCell className="text-sm">
                {formatDate(o.summary.lastBookingDate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDunningRuns } from '@/hooks'
import { DunningReminderDetailSheet } from './dunning-reminder-detail-sheet'

type StatusFilter = 'ALL' | 'DRAFT' | 'SENT' | 'CANCELLED'

type ReminderRow = {
  id: string
  number: string
  level: number
  status: string
  createdAt: Date | string
  sentAt: Date | string | null
  totalDue: number
  customerAddress: { company: string | null } | null
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'SENT') return 'default'
  if (status === 'DRAFT') return 'secondary'
  return 'outline'
}

export function DunningRunsTab() {
  const t = useTranslations('billingDunning')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ALL')
  const [selectedReminderId, setSelectedReminderId] = React.useState<string | null>(null)

  const { data: runs, isLoading } = useDunningRuns(statusFilter)
  const rows = (runs as ReminderRow[] | undefined) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base sm:text-lg font-semibold">{t('runs.title')}</h2>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('runs.statusAll')}</SelectItem>
            <SelectItem value="DRAFT">{t('runs.statusDraft')}</SelectItem>
            <SelectItem value="SENT">{t('runs.statusSent')}</SelectItem>
            <SelectItem value="CANCELLED">{t('runs.statusCancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {t('loading')}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('runs.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('runs.columnNumber')}</TableHead>
                <TableHead>{t('runs.columnCustomer')}</TableHead>
                <TableHead>{t('runs.columnLevel')}</TableHead>
                <TableHead>{t('runs.columnStatus')}</TableHead>
                <TableHead>{t('runs.columnCreatedAt')}</TableHead>
                <TableHead>{t('runs.columnSentAt')}</TableHead>
                <TableHead className="text-right">{t('runs.columnTotal')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedReminderId(row.id)}
                  data-testid="reminder-row"
                >
                  <TableCell className="font-medium">{row.number}</TableCell>
                  <TableCell>
                    {row.customerAddress?.company ?? '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {t('runs.levelBadge', { level: row.level })}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={statusBadgeVariant(row.status)}
                      data-testid="reminder-status-badge"
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                  <TableCell>{formatDate(row.sentAt)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.totalDue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DunningReminderDetailSheet
        reminderId={selectedReminderId}
        onOpenChange={(open) => {
          if (!open) setSelectedReminderId(null)
        }}
      />
    </div>
  )
}

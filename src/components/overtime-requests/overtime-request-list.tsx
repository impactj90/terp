'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCancelOvertimeRequest } from '@/hooks'

interface OvertimeRequestRow {
  id: string
  requestType: string
  requestDate: string | Date
  plannedMinutes: number
  reason: string
  status: string
  rejectionReason: string | null
  arbzgWarnings: string[]
}

interface OvertimeRequestListProps {
  items: OvertimeRequestRow[]
  isLoading?: boolean
  showCancel?: boolean
}

function formatDate(value: string | Date): string {
  const iso =
    typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function statusVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'approved':
      return 'default'
    case 'pending':
      return 'secondary'
    case 'rejected':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function OvertimeRequestList({
  items,
  isLoading,
  showCancel,
}: OvertimeRequestListProps) {
  const t = useTranslations('overtime_requests')
  const tPage = useTranslations('overtime_requests.page')
  const tToast = useTranslations('overtime_requests.toast')
  const cancel = useCancelOvertimeRequest()

  const handleCancel = async (id: string) => {
    try {
      await cancel.mutateAsync({ id })
      toast.success(tToast('cancelled'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tToast('actionFailed'))
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">…</p>
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">{tPage('noRequests')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('detail.date')}</TableHead>
              <TableHead>{t('detail.type')}</TableHead>
              <TableHead>{t('detail.plannedMinutes')}</TableHead>
              <TableHead>{t('detail.reason')}</TableHead>
              <TableHead>{t('detail.status')}</TableHead>
              {showCancel ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {formatDate(item.requestDate)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {t(`requestType.${item.requestType}` as 'requestType.PLANNED')}
                  </Badge>
                </TableCell>
                <TableCell>{item.plannedMinutes}</TableCell>
                <TableCell className="max-w-xs truncate" title={item.reason}>
                  {item.reason}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(item.status)}>
                    {t(
                      `status.${item.status}` as 'status.pending'
                    )}
                  </Badge>
                </TableCell>
                {showCancel ? (
                  <TableCell className="text-right">
                    {item.status === 'pending' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(item.id)}
                        disabled={cancel.isPending}
                      >
                        <X className="mr-1 h-3 w-3" />
                        {t('detail.cancel')}
                      </Button>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

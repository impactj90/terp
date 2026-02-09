'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { History } from 'lucide-react'
import { formatDistanceToNow, differenceInSeconds } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MacroStatusBadge } from './macro-status-badge'
import type { components } from '@/lib/api/types'

type MacroExecution = components['schemas']['schema3']

interface MacroExecutionLogProps {
  executions: MacroExecution[]
}

export function MacroExecutionLog({ executions }: MacroExecutionLogProps) {
  const t = useTranslations('adminMacros')

  const formatDuration = (startedAt?: string | null, completedAt?: string | null) => {
    if (!startedAt || !completedAt) return '-'
    const seconds = differenceInSeconds(new Date(completedAt), new Date(startedAt))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const formatTime = (date?: string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleString()
  }

  const formatRelative = (date?: string | null) => {
    if (!date) return ''
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  }

  if (executions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">{t('executionLogTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <History className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
            <p className="mt-4 text-muted-foreground">{t('noExecutions')}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">{t('executionLogTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columnStatus')}</TableHead>
              <TableHead>{t('columnTrigger')}</TableHead>
              <TableHead>{t('columnStartedAt')}</TableHead>
              <TableHead>{t('columnDuration')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {executions.map((execution) => (
              <TableRow key={execution.id}>
                <TableCell>
                  <MacroStatusBadge status={execution.status} />
                  {execution.error_message && (
                    <p className="text-xs text-destructive mt-1 max-w-xs truncate">
                      {execution.error_message}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {execution.trigger_type === 'manual'
                      ? t('triggerManual')
                      : t('triggerScheduled')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{formatTime(execution.started_at)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatRelative(execution.started_at)}
                  </div>
                </TableCell>
                <TableCell>
                  {formatDuration(execution.started_at, execution.completed_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

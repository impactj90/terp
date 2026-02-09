'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { History, ChevronDown, ChevronRight } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { ScheduleStatusBadge } from './schedule-status-badge'
import type { components } from '@/lib/api/types'

type ScheduleExecution = components['schemas']['ScheduleExecution']
type ScheduleTaskExecution = components['schemas']['ScheduleTaskExecution']

interface ScheduleExecutionLogProps {
  executions: ScheduleExecution[]
}

export function ScheduleExecutionLog({ executions }: ScheduleExecutionLogProps) {
  const t = useTranslations('adminSchedules')
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

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

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
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
              <TableHead className="w-8" />
              <TableHead>{t('columnStatus')}</TableHead>
              <TableHead>{t('columnTrigger')}</TableHead>
              <TableHead>{t('columnStartedAt')}</TableHead>
              <TableHead>{t('columnDuration')}</TableHead>
              <TableHead>{t('columnTasks')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {executions.map((execution) => (
              <React.Fragment key={execution.id}>
                <TableRow className="hover:bg-muted/50">
                  <TableCell>
                    {execution.task_executions && execution.task_executions.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => toggleExpanded(execution.id)}
                      >
                        {expandedId === execution.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <ScheduleStatusBadge status={execution.status} />
                    {execution.error_message && (
                      <p className="text-xs text-destructive mt-1 max-w-xs truncate">
                        {execution.error_message}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {execution.trigger_type === 'manual' ? t('triggerManual') : t('triggerScheduled')}
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
                  <TableCell>
                    {execution.tasks_succeeded ?? 0}/{execution.tasks_total ?? 0}
                    {(execution.tasks_failed ?? 0) > 0 && (
                      <span className="text-destructive ml-1">
                        ({execution.tasks_failed} failed)
                      </span>
                    )}
                  </TableCell>
                </TableRow>
                {execution.task_executions &&
                  execution.task_executions.length > 0 &&
                  expandedId === execution.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30 p-0">
                        <TaskExecutionDetails tasks={execution.task_executions} />
                      </TableCell>
                    </TableRow>
                  )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function TaskExecutionDetails({ tasks }: { tasks: ScheduleTaskExecution[] }) {
  const t = useTranslations('adminSchedules')

  const getStatusBadge = (status?: ScheduleTaskExecution['status']) => {
    if (!status) return null
    const styles: Record<NonNullable<typeof status>, string> = {
      pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
      running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      skipped: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    }
    return (
      <Badge variant="secondary" className={styles[status]}>
        {status}
      </Badge>
    )
  }

  return (
    <div className="px-8 py-4">
      <h4 className="text-sm font-medium mb-2">{t('taskExecutionDetails')}</h4>
      <div className="space-y-2">
        {tasks
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-4 text-sm border rounded p-2 bg-background"
            >
              <Badge variant="outline">#{task.sort_order}</Badge>
              <span className="font-medium flex-1">{task.task_type}</span>
              {getStatusBadge(task.status)}
              {task.error_message && (
                <span className="text-xs text-destructive max-w-xs truncate">
                  {task.error_message}
                </span>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

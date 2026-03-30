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

interface ScheduleTaskExecution {
  id: string
  taskType: string
  sortOrder: number
  status: string
  startedAt: string | Date | null
  completedAt: string | Date | null
  errorMessage: string | null
  result?: unknown
}

interface ScheduleExecution {
  id: string
  status: string
  triggerType: string
  startedAt: string | Date | null
  completedAt: string | Date | null
  errorMessage: string | null
  tasksTotal: number
  tasksSucceeded: number
  tasksFailed: number
  taskExecutions?: ScheduleTaskExecution[]
}

interface ScheduleExecutionLogProps {
  executions: ScheduleExecution[]
}

export function ScheduleExecutionLog({ executions }: ScheduleExecutionLogProps) {
  const t = useTranslations('adminSchedules')
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const formatDuration = (startedAt?: Date | string | null, completedAt?: Date | string | null) => {
    if (!startedAt || !completedAt) return '-'
    const seconds = differenceInSeconds(new Date(completedAt), new Date(startedAt))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const formatTime = (date?: Date | string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleString()
  }

  const formatRelative = (date?: Date | string | null) => {
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
                    {execution.taskExecutions && execution.taskExecutions.length > 0 && (
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
                    {execution.errorMessage && (
                      <p className="text-xs text-destructive mt-1 max-w-xs truncate">
                        {execution.errorMessage}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {execution.triggerType === 'manual' ? t('triggerManual') : t('triggerScheduled')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{formatTime(execution.startedAt)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatRelative(execution.startedAt)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatDuration(execution.startedAt, execution.completedAt)}
                  </TableCell>
                  <TableCell>
                    {execution.tasksSucceeded ?? 0}/{execution.tasksTotal ?? 0}
                    {(execution.tasksFailed ?? 0) > 0 && (
                      <span className="text-destructive ml-1">
                        ({execution.tasksFailed} failed)
                      </span>
                    )}
                  </TableCell>
                </TableRow>
                {execution.taskExecutions &&
                  execution.taskExecutions.length > 0 &&
                  expandedId === execution.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30 p-0">
                        <TaskExecutionDetails tasks={execution.taskExecutions} />
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

  const getStatusBadge = (status?: string) => {
    if (!status) return null
    const variants: Record<string, 'gray' | 'blue' | 'green' | 'red'> = {
      pending: 'gray',
      running: 'blue',
      completed: 'green',
      failed: 'red',
      skipped: 'gray',
    }
    return (
      <Badge variant={variants[status] ?? 'gray'}>
        {status}
      </Badge>
    )
  }

  return (
    <div className="px-8 py-4">
      <h4 className="text-sm font-medium mb-2">{t('taskExecutionDetails')}</h4>
      <div className="space-y-2">
        {tasks
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-4 text-sm border rounded p-2 bg-background"
            >
              <Badge variant="outline">#{task.sortOrder}</Badge>
              <span className="font-medium flex-1">{task.taskType}</span>
              {getStatusBadge(task.status)}
              {task.errorMessage && (
                <span className="text-xs text-destructive max-w-xs truncate">
                  {task.errorMessage}
                </span>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

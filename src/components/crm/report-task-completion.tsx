'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useCrmTaskCompletion,
  useCrmTasksByAssignee,
} from '@/hooks/use-crm-reports'

export function ReportTaskCompletion() {
  const t = useTranslations('crmReports')

  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')

  const filterParams: { dateFrom?: string; dateTo?: string } = {}
  if (dateFrom) filterParams.dateFrom = `${dateFrom}T00:00:00.000Z`
  if (dateTo) filterParams.dateTo = `${dateTo}T23:59:59.999Z`

  const { data: completion, isLoading: completionLoading } =
    useCrmTaskCompletion(filterParams)
  const { data: assigneeData, isLoading: assigneeLoading } =
    useCrmTasksByAssignee(filterParams)

  return (
    <div className="space-y-4">
      {/* Optional Date Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label>{t('dateFrom')}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label>{t('dateTo')}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t('completionRate')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completionLoading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <>
                <div className="text-3xl font-bold">
                  {completion?.completionRate ?? 0}%
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(completion?.completionRate ?? 0, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {completion?.completed ?? 0} / {completion?.total ?? 0}{' '}
                  {t('completed')}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t('avgCompletionDays')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completionLoading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <div className="text-3xl font-bold">
                {completion?.avgCompletionDays ?? '—'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t('overdueCount')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completionLoading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <div className="text-3xl font-bold text-destructive">
                {completion?.overdue ?? 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Table: Tasks by Assignee */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('tasksByAssignee')}</CardTitle>
        </CardHeader>
        <CardContent>
          {assigneeLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : !assigneeData?.assignees.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('noData')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead className="text-right">{t('total')}</TableHead>
                  <TableHead className="text-right">
                    {t('completed')}
                  </TableHead>
                  <TableHead className="text-right">{t('open')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assigneeData.assignees.map((row) => (
                  <TableRow key={row.employeeId}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right">{row.total}</TableCell>
                    <TableCell className="text-right">
                      {row.completed}
                    </TableCell>
                    <TableCell className="text-right">{row.open}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { CalendarClock, ChevronRight, RefreshCw, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useProbationDashboard } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function formatDate(date: Date | string) {
  return format(new Date(date), 'dd.MM.yyyy')
}

export function ProbationDashboardWidget() {
  const t = useTranslations('dashboardProbation')
  const { data, isLoading, error, refetch, isFetching } = useProbationDashboard()

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </div>
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{t('loadError')}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('retry')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-3xl font-semibold tracking-tight">{data?.total ?? 0}</p>
                <p className="text-sm text-muted-foreground">
                  {t('countLabel', { count: data?.total ?? 0 })}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/employees?probation=ENDS_IN_30_DAYS">
                  <Users className="mr-2 h-4 w-4" />
                  {t('openFilteredList')}
                </Link>
              </Button>
            </div>

            {data && data.items.length > 0 ? (
              <div className="space-y-2">
                {data.items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/admin/employees/${item.id}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.firstName} {item.lastName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.departmentName ?? t('noDepartment')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('endsOn', { date: formatDate(item.endDate) })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 pl-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {t('daysRemaining', { count: item.daysRemaining })}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

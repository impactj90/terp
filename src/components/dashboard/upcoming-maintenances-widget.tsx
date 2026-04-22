'use client'

import Link from 'next/link'
import { RefreshCw, Wrench } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useServiceSchedulesDashboardSummary } from '@/hooks/use-service-schedules'

export function UpcomingMaintenancesWidget() {
  const t = useTranslations('serviceSchedules.widget')
  const { data, isLoading, isError, refetch, isFetching } =
    useServiceSchedulesDashboardSummary()

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </div>
        <Wrench className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{t('loadError')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('retry')}
            </Button>
          </div>
        ) : data ? (
          <>
            <div className="space-y-1">
              <p className="text-3xl font-semibold tracking-tight">
                {data.overdueCount}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('overdueCount', { count: data.overdueCount })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('dueSoonCount', { count: data.dueSoonCount })}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/serviceobjects/schedules">{t('viewAll')}</Link>
              </Button>
              {data.overdueCount > 0 && (
                <Button asChild size="sm">
                  <Link href="/serviceobjects/schedules?status=overdue">
                    {t('viewOverdue')}
                  </Link>
                </Button>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

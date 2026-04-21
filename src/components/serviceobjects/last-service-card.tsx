'use client'

import * as React from 'react'
import { Clock4, History, Wrench } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useServiceObjectHistory } from '@/hooks/use-service-objects'

interface LastServiceCardProps {
  serviceObjectId: string
  onViewHistory?: () => void
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

function daysAgo(date: Date | string): number {
  const then = new Date(date).getTime()
  const now = Date.now()
  return Math.max(0, Math.floor((now - then) / 86_400_000))
}

export function LastServiceCard({
  serviceObjectId,
  onViewHistory,
}: LastServiceCardProps) {
  const t = useTranslations('serviceObjects')
  const { data, isLoading } = useServiceObjectHistory(serviceObjectId, {
    limit: 1,
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4">
          <Skeleton className="h-5 w-1/3" />
          <div className="mt-2 space-y-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const latest = data?.orders?.[0]

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-muted-foreground">
            <Wrench className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('lastService.title')}</p>
            {!latest ? (
              <p className="text-sm text-muted-foreground">
                {t('lastService.empty')}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">
                  {formatDate(
                    latest.summary.lastBookingDate ?? latest.createdAt
                  )}
                </span>
                {latest.summary.lastBookingDate && (
                  <Badge variant="secondary" className="gap-1">
                    <Clock4 className="h-3 w-3" />
                    {t('lastService.daysAgo', {
                      days: daysAgo(latest.summary.lastBookingDate),
                    })}
                  </Badge>
                )}
                {latest.assignedEmployees.length > 0 && (
                  <span className="text-muted-foreground">
                    {latest.assignedEmployees
                      .map((e) => `${e.firstName} ${e.lastName}`)
                      .join(', ')}
                  </span>
                )}
                {latest.summary.totalMinutes > 0 && (
                  <span className="font-mono text-muted-foreground">
                    {formatHours(latest.summary.totalMinutes)} h
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {latest.code} — {latest.name}
                </span>
              </div>
            )}
          </div>
        </div>
        {onViewHistory && (
          <Button
            variant="outline"
            size="sm"
            onClick={onViewHistory}
            className="self-start md:self-auto"
          >
            <History className="mr-2 h-4 w-4" />
            {t('lastService.viewHistory')}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

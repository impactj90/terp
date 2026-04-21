'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useServiceObjectHistory } from '@/hooks/use-service-objects'
import { ServiceObjectHistoryOrdersTable } from './service-object-history-orders-table'
import { ServiceObjectHistoryMovementsTable } from './service-object-history-movements-table'

interface Props {
  serviceObjectId: string
}

function formatTotalHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10
  return hours.toString()
}

export function ServiceObjectHistoryTab({ serviceObjectId }: Props) {
  const t = useTranslations('serviceObjects.history')
  const { data, isLoading } = useServiceObjectHistory(serviceObjectId)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const orders = data?.orders ?? []
  const movements = data?.stockMovements ?? []
  const totals = data?.totals ?? {
    orderCount: 0,
    totalMinutes: 0,
    movementCount: 0,
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>{t('ordersSection')}</CardTitle>
          <div className="text-sm text-muted-foreground">
            {t('totals.orderCount', { count: totals.orderCount })}
            {totals.totalMinutes > 0 && (
              <>
                {' · '}
                {t('totals.totalHours', {
                  hours: formatTotalHours(totals.totalMinutes),
                })}
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ServiceObjectHistoryOrdersTable items={orders} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>{t('movementsSection')}</CardTitle>
          <div className="text-sm text-muted-foreground">
            {t('totals.movementCount', { count: totals.movementCount })}
          </div>
        </CardHeader>
        <CardContent>
          <ServiceObjectHistoryMovementsTable items={movements} />
        </CardContent>
      </Card>
    </div>
  )
}

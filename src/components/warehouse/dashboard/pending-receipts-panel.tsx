'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { AlertCircle, RefreshCw, PackageCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useWhPendingOrders } from '@/hooks/use-wh-stock-movements'

export function PendingReceiptsPanel({ className }: { className?: string }) {
  const t = useTranslations('warehouseDashboard')
  const { data, isLoading, error, refetch } = useWhPendingOrders()

  if (isLoading) {
    return <PendingReceiptsSkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border', className)}>
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{t('pendingReceipts')}</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{t('loading')}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            {t('viewAll')}
          </Button>
        </div>
      </div>
    )
  }

  const items = data?.slice(0, 5) ?? []

  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-lg font-semibold">{t('pendingReceipts')}</h2>
        <Link
          href="/warehouse/goods-receipt"
          className="text-sm text-primary hover:underline"
        >
          {t('viewAll')}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="p-6">
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
              <PackageCheck className="h-6 w-6 text-green-600 dark:text-green-500" />
            </div>
            <p className="mt-3 text-sm font-medium">{t('pendingEmpty')}</p>
          </div>
        </div>
      ) : (
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-6 py-2 font-medium">{t('colPoNumber')}</th>
                <th className="px-3 py-2 font-medium">{t('colSupplier')}</th>
                <th className="px-3 py-2 pr-6 font-medium text-right">{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((po) => (
                <tr key={po.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-2 font-medium">{po.number}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {po.supplier?.company || '—'}
                  </td>
                  <td className="px-3 py-2 pr-6 text-right">
                    <Badge variant={po.status === 'ORDERED' ? 'blue' : 'amber'}>
                      {po.status === 'ORDERED' ? t('statusOrdered') : t('statusPartiallyReceived')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PendingReceiptsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="border-b px-6 py-4">
        <Skeleton className="h-6 w-44" />
      </div>
      <div className="divide-y">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-6 py-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

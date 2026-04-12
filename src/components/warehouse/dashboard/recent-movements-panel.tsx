'use client'

import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import {
  AlertCircle,
  RefreshCw,
  PackageCheck,
  PackageMinus,
  Wrench,
  ClipboardList,
  RotateCcw,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useWhRecentMovements } from '@/hooks/use-wh-dashboard'

const MOVEMENT_CONFIG: Record<string, {
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
  bgClass: string
}> = {
  GOODS_RECEIPT: {
    icon: PackageCheck,
    colorClass: 'text-green-600 dark:text-green-500',
    bgClass: 'bg-green-100 dark:bg-green-900/30',
  },
  WITHDRAWAL: {
    icon: PackageMinus,
    colorClass: 'text-red-600 dark:text-red-500',
    bgClass: 'bg-red-100 dark:bg-red-900/30',
  },
  ADJUSTMENT: {
    icon: Wrench,
    colorClass: 'text-amber-600 dark:text-amber-500',
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
  },
  INVENTORY: {
    icon: ClipboardList,
    colorClass: 'text-blue-600 dark:text-blue-500',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
  },
  RETURN: {
    icon: RotateCcw,
    colorClass: 'text-orange-600 dark:text-orange-500',
    bgClass: 'bg-orange-100 dark:bg-orange-900/30',
  },
}

const MOVEMENT_LABEL_KEY: Record<string, string> = {
  GOODS_RECEIPT: 'movementGoodsReceipt',
  WITHDRAWAL: 'movementWithdrawal',
  ADJUSTMENT: 'movementAdjustment',
  INVENTORY: 'movementInventory',
  RETURN: 'movementReturn',
}

export function RecentMovementsPanel({ className }: { className?: string }) {
  const t = useTranslations('warehouseDashboard')
  const locale = useLocale()
  const { data, isLoading, error, refetch } = useWhRecentMovements()

  if (isLoading) {
    return <RecentMovementsSkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border', className)}>
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{t('recentMovements')}</h2>
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

  const items = data ?? []

  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-lg font-semibold">{t('recentMovements')}</h2>
        <Link
          href="/warehouse/stock-movements"
          className="text-sm text-primary hover:underline"
        >
          {t('viewAll')}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="p-6">
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="rounded-full bg-muted p-3">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">{t('recentEmpty')}</p>
          </div>
        </div>
      ) : (
        <div className="divide-y">
          {items.map((m) => {
            const defaultConfig = { icon: Wrench, colorClass: 'text-amber-600 dark:text-amber-500', bgClass: 'bg-amber-100 dark:bg-amber-900/30' }
            const config = MOVEMENT_CONFIG[m.type] ?? defaultConfig
            const Icon = config.icon
            const labelKey = MOVEMENT_LABEL_KEY[m.type] ?? 'movementAdjustment'
            const isPositive = m.quantity > 0

            return (
              <div
                key={m.id}
                className="flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className={cn('rounded-full p-1.5', config.bgClass)}>
                  <Icon className={cn('h-3.5 w-3.5', config.colorClass)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t(labelKey as Parameters<typeof t>[0])}
                    </span>
                  </div>
                  <p className="text-sm truncate">
                    <span className="font-medium">{m.article.number}</span>
                    <span className="ml-1 text-muted-foreground">{m.article.name}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className={cn(
                    'text-sm font-semibold',
                    isPositive
                      ? 'text-green-600 dark:text-green-500'
                      : 'text-red-600 dark:text-red-500'
                  )}>
                    {isPositive ? '+' : ''}{m.quantity} {m.article.unit}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.date).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RecentMovementsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="border-b px-6 py-4">
        <Skeleton className="h-6 w-44" />
      </div>
      <div className="divide-y">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 px-6 py-3">
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3 w-16 mb-1" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="text-right">
              <Skeleton className="h-4 w-16 mb-1" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

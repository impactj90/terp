'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { AlertCircle, RefreshCw, PackageSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useWhReorderSuggestions } from '@/hooks/use-wh-purchase-orders'

export function ReorderSuggestionsPanel({ className }: { className?: string }) {
  const t = useTranslations('warehouseDashboard')
  const { data, isLoading, error, refetch } = useWhReorderSuggestions()

  if (isLoading) {
    return <ReorderSuggestionsSkeleton className={className} />
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border', className)}>
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{t('reorderSuggestions')}</h2>
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
        <h2 className="text-lg font-semibold">{t('reorderSuggestions')}</h2>
        <Link
          href="/warehouse/purchase-orders/suggestions"
          className="text-sm text-primary hover:underline"
        >
          {t('viewAll')}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="p-6">
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
              <PackageSearch className="h-6 w-6 text-green-600 dark:text-green-500" />
            </div>
            <p className="mt-3 text-sm font-medium">{t('reorderEmpty')}</p>
          </div>
        </div>
      ) : (
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-6 py-2 font-medium">{t('colArticle')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('colCurrentStock')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('colMinStock')}</th>
                <th className="px-3 py-2 pr-6 font-medium text-right">{t('colDeficit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.articleId} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-2">
                    <span className="font-medium">{item.articleNumber}</span>
                    <span className="ml-2 text-muted-foreground">{item.articleName}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{item.currentStock}</td>
                  <td className="px-3 py-2 text-right">{item.minStock}</td>
                  <td className="px-3 py-2 pr-6 text-right font-medium text-red-600 dark:text-red-500">
                    {item.deficit}
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

function ReorderSuggestionsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="border-b px-6 py-4">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="divide-y">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-6 py-3">
            <Skeleton className="h-4 w-48 flex-1" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

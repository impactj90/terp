'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useWhArticleAvailableStock } from '@/hooks'

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '\u2014'}</span>
    </div>
  )
}

interface ArticleStockInfoCardProps {
  articleId: string
  article: {
    currentStock: number
    minStock?: number | null
    warehouseLocation?: string | null
  }
}

export function ArticleStockInfoCard({ articleId, article }: ArticleStockInfoCardProps) {
  const t = useTranslations('warehouseArticles')
  const tRes = useTranslations('warehouseReservations')
  const { data: stockData } = useWhArticleAvailableStock(articleId)

  const reservedStock = stockData?.reservedStock ?? 0
  const availableStock = stockData?.availableStock ?? article.currentStock

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-sm font-semibold mb-3">{t('sectionStock')}</h3>
        <DetailRow
          label={tRes('labelPhysicalStock')}
          value={article.currentStock}
        />
        <DetailRow
          label={tRes('labelReservedStock')}
          value={
            reservedStock > 0 ? (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                {reservedStock}
              </Badge>
            ) : (
              0
            )
          }
        />
        <DetailRow
          label={tRes('labelAvailableStock')}
          value={availableStock}
        />
        <DetailRow label={t('labelMinStock')} value={article.minStock ?? '\u2014'} />
        <DetailRow label={t('labelWarehouseLocation')} value={article.warehouseLocation} />
        {article.minStock != null && article.currentStock < article.minStock && (
          <div className="mt-2 p-2 bg-destructive/10 text-destructive text-sm rounded-md">
            {t('alertBelowMinStock')}
          </div>
        )}
        {availableStock < 0 && (
          <div className="mt-2 p-2 bg-orange-100 text-orange-700 text-sm rounded-md">
            {tRes('alertInsufficientStock')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

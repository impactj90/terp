'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Trash2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useWhArticle, useSetWhArticlePrice, useRemoveWhArticlePrice } from '@/hooks'
import { useTranslations } from 'next-intl'

interface PriceDetailEditorProps {
  priceListId: string | null
  articleId: string | null
  entryData?: {
    unitPrice: number
    minQuantity: number | null
    unit: string | null
  } | null
  canManage?: boolean
}

export function PriceDetailEditor({
  priceListId,
  articleId,
  entryData,
  canManage = false,
}: PriceDetailEditorProps) {
  const t = useTranslations('warehousePrices')
  const { data: article, isLoading: articleLoading } = useWhArticle(articleId || '', !!articleId)
  const setPrice = useSetWhArticlePrice()
  const removePrice = useRemoveWhArticlePrice()

  const [unitPrice, setUnitPrice] = React.useState('')
  const [minQuantity, setMinQuantity] = React.useState('')
  const [unit, setUnit] = React.useState('')

  // Sync form fields when entryData or article changes
  React.useEffect(() => {
    if (entryData) {
      setUnitPrice(String(entryData.unitPrice))
      setMinQuantity(entryData.minQuantity != null ? String(entryData.minQuantity) : '')
      setUnit(entryData.unit || article?.unit || '')
    } else if (article) {
      setUnitPrice(article.sellPrice != null ? String(article.sellPrice) : '0')
      setMinQuantity('')
      setUnit(article.unit || '')
    }
  }, [entryData, article])

  if (!priceListId || !articleId) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full text-muted-foreground text-sm py-12">
          {!priceListId ? t('selectPriceList') : t('selectArticle')}
        </CardContent>
      </Card>
    )
  }

  if (articleLoading) {
    return (
      <Card className="h-full">
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!article) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full text-muted-foreground text-sm py-12">
          {t('articleNotFound')}
        </CardContent>
      </Card>
    )
  }

  function handleSave() {
    if (!priceListId || !articleId) return
    const parsedPrice = parseFloat(unitPrice)
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error(t('invalidPrice'))
      return
    }

    setPrice.mutate(
      {
        priceListId,
        articleId,
        unitPrice: parsedPrice,
        minQuantity: minQuantity ? parseFloat(minQuantity) : undefined,
        unit: unit || undefined,
      },
      {
        onSuccess: () => toast.success(t('priceSaved')),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleRemove() {
    if (!priceListId || !articleId) return
    removePrice.mutate(
      { priceListId, articleId },
      {
        onSuccess: () => toast.success(t('priceRemoved')),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const formatPrice = (price: number | null | undefined) => {
    if (price == null) return '\u2014'
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price)
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          <span className="font-mono text-xs mr-2">{article.number}</span>
          {article.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Base price reference */}
        <div className="text-xs text-muted-foreground">
          {t('basePrice')}: {formatPrice(article.sellPrice)}
        </div>

        {/* Form fields */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="unitPrice" className="text-xs">{t('unitPrice')}</Label>
            <Input
              id="unitPrice"
              type="number"
              step="0.01"
              min="0"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              disabled={!canManage}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="minQuantity" className="text-xs">{t('minQuantity')}</Label>
            <Input
              id="minQuantity"
              type="number"
              step="1"
              min="0"
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              disabled={!canManage}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="unit" className="text-xs">{t('unit')}</Label>
            <Input
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={!canManage}
              className="mt-1"
            />
          </div>
        </div>

        {/* Actions */}
        {canManage && (
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={setPrice.isPending}
              size="sm"
              className="flex-1"
            >
              <Save className="h-4 w-4 mr-1" />
              {t('save')}
            </Button>
            <Button
              onClick={handleRemove}
              disabled={removePrice.isPending}
              variant="destructive"
              size="sm"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

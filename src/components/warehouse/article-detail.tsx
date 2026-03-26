'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Edit, Trash2, RotateCcw, Package, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useWhArticle,
  useDeleteWhArticle,
  useRestoreWhArticle,
} from '@/hooks'
import { useGenerateLabelPdf } from '@/hooks/use-wh-qr'
import { ArticleFormSheet } from './article-form-sheet'
import { ArticleSupplierList } from './article-supplier-list'
import { ArticleMovementsTab } from './article-movements-tab'
import { ArticleBomList } from './article-bom-list'
import { ArticleStockAdjustDialog } from './article-stock-adjust-dialog'
import { ArticlePriceTab } from './article-price-tab'
import { ArticleImagesTab } from './article-images-tab'
import { ArticleStockInfoCard } from './article-stock-info-card'
import { ArticleReservationsTab } from './article-reservations-tab'

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '\u2014'}</span>
    </div>
  )
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '\u2014'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(price)
}

interface ArticleDetailProps {
  articleId: string
}

export function ArticleDetail({ articleId }: ArticleDetailProps) {
  const router = useRouter()
  const { data: article, isLoading } = useWhArticle(articleId)
  const deleteArticle = useDeleteWhArticle()
  const restoreArticle = useRestoreWhArticle()

  const t = useTranslations('warehouseArticles')

  const generateLabelPdf = useGenerateLabelPdf()

  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [stockAdjustOpen, setStockAdjustOpen] = React.useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!article) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('articleNotFound')}
      </div>
    )
  }

  function handleDelete() {
    deleteArticle.mutate(
      { id: articleId },
      {
        onSuccess: () => {
          toast.success(t('toastDeactivated'))
          setDeleteOpen(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleRestore() {
    restoreArticle.mutate(
      { id: articleId },
      {
        onSuccess: () => toast.success(t('toastRestored')),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handlePrintLabel() {
    toast.info(t('toastLabelPdfGenerating'))
    generateLabelPdf.mutate(
      { articleIds: [articleId] },
      {
        onSuccess: (result) => {
          if (result?.signedUrl) {
            toast.success(t('toastLabelPdfReady'))
            const link = document.createElement('a')
            link.href = result.signedUrl
            link.download = result.filename
            link.target = '_blank'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
          }
        },
        onError: () => toast.error(t('toastLabelPdfError')),
      }
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/warehouse/articles')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="font-mono">{article.number}</span>
              <span>{article.name}</span>
            </h1>
            <div className="flex gap-2 mt-1">
              {article.isActive ? (
                <Badge variant="default">{t('statusActive')}</Badge>
              ) : (
                <Badge variant="secondary">{t('statusInactive')}</Badge>
              )}
              {article.stockTracking && (
                <Badge variant="outline">{t('badgeStockTracking')}</Badge>
              )}
              {article.group && (
                <Badge variant="outline">{article.group.name}</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintLabel}
            disabled={generateLabelPdf.isPending}
          >
            <QrCode className="h-4 w-4 mr-2" />
            {t('actionPrintLabel')}
          </Button>
          {article.stockTracking && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStockAdjustOpen(true)}
            >
              <Package className="h-4 w-4 mr-2" />
              {t('actionAdjustStock')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            {t('actionEdit')}
          </Button>
          {article.isActive ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('actionDeactivate')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleRestore}>
              <RotateCcw className="h-4 w-4 mr-2" />
              {t('actionRestore')}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('tabOverview')}</TabsTrigger>
          <TabsTrigger value="suppliers">{t('tabSuppliers')}</TabsTrigger>
          <TabsTrigger value="bom">{t('tabBom')}</TabsTrigger>
          <TabsTrigger value="stock">{t('tabStock')}</TabsTrigger>
          <TabsTrigger value="reservations">{t('tabReservations')}</TabsTrigger>
          <TabsTrigger value="prices">{t('tabPrices')}</TabsTrigger>
          <TabsTrigger value="images">{t('tabImages')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Basic Info */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-semibold mb-3">{t('sectionMasterData')}</h3>
                <DetailRow label={t('labelArticleNumber')} value={article.number} />
                <DetailRow label={t('labelName')} value={article.name} />
                <DetailRow label={t('labelDescription')} value={article.description} />
                <DetailRow label={t('labelMatchcode')} value={article.matchCode} />
                <DetailRow label={t('labelUnit')} value={article.unit} />
                <DetailRow label={t('labelGroup')} value={article.group?.name} />
                <DetailRow label={t('labelDiscountGroup')} value={article.discountGroup} />
                <DetailRow label={t('labelOrderType')} value={article.orderType} />
              </CardContent>
            </Card>

            {/* Prices */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-semibold mb-3">{t('sectionPrices')}</h3>
                <DetailRow label={t('labelSellPrice')} value={formatPrice(article.sellPrice)} />
                <DetailRow label={t('labelBuyPrice')} value={formatPrice(article.buyPrice)} />
                <DetailRow label={t('labelVatRate')} value={`${article.vatRate}%`} />
              </CardContent>
            </Card>

            {/* Stock Info */}
            {article.stockTracking && (
              <ArticleStockInfoCard articleId={articleId} article={article} />
            )}
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4">
          <ArticleSupplierList articleId={articleId} />
        </TabsContent>

        <TabsContent value="bom" className="mt-4">
          <ArticleBomList articleId={articleId} />
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <ArticleMovementsTab articleId={articleId} />
        </TabsContent>

        <TabsContent value="reservations" className="mt-4">
          <ArticleReservationsTab articleId={articleId} />
        </TabsContent>

        <TabsContent value="prices" className="mt-4">
          <ArticlePriceTab articleId={articleId} />
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          <ArticleImagesTab articleId={articleId} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ArticleFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        article={article as unknown as Record<string, unknown>}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('confirmDeactivateTitle')}
        description={t('confirmDeactivateDescription', { name: article.name })}
        confirmLabel={t('actionDeactivate')}
        onConfirm={handleDelete}
        variant="destructive"
      />

      {article.stockTracking && (
        <ArticleStockAdjustDialog
          articleId={articleId}
          currentStock={article.currentStock}
          open={stockAdjustOpen}
          onOpenChange={setStockAdjustOpen}
        />
      )}
    </div>
  )
}

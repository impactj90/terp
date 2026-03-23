'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Edit, Trash2, RotateCcw, Package } from 'lucide-react'
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
import { ArticleFormSheet } from './article-form-sheet'
import { ArticleSupplierList } from './article-supplier-list'
import { ArticleBomList } from './article-bom-list'
import { ArticleStockAdjustDialog } from './article-stock-adjust-dialog'

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
        Artikel nicht gefunden
      </div>
    )
  }

  function handleDelete() {
    deleteArticle.mutate(
      { id: articleId },
      {
        onSuccess: () => {
          toast.success('Artikel deaktiviert')
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
        onSuccess: () => toast.success('Artikel wiederhergestellt'),
        onError: (err) => toast.error(err.message),
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
                <Badge variant="default">Aktiv</Badge>
              ) : (
                <Badge variant="secondary">Inaktiv</Badge>
              )}
              {article.stockTracking && (
                <Badge variant="outline">Bestandsfuehrung</Badge>
              )}
              {article.group && (
                <Badge variant="outline">{article.group.name}</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {article.stockTracking && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStockAdjustOpen(true)}
            >
              <Package className="h-4 w-4 mr-2" />
              Bestand korrigieren
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            Bearbeiten
          </Button>
          {article.isActive ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Deaktivieren
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleRestore}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Wiederherstellen
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Uebersicht</TabsTrigger>
          <TabsTrigger value="suppliers">Lieferanten</TabsTrigger>
          <TabsTrigger value="bom">Stueckliste</TabsTrigger>
          <TabsTrigger value="stock">Bestand</TabsTrigger>
          <TabsTrigger value="prices">Preise</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Basic Info */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-semibold mb-3">Stammdaten</h3>
                <DetailRow label="Artikelnr." value={article.number} />
                <DetailRow label="Bezeichnung" value={article.name} />
                <DetailRow label="Beschreibung" value={article.description} />
                <DetailRow label="Matchcode" value={article.matchCode} />
                <DetailRow label="Einheit" value={article.unit} />
                <DetailRow label="Artikelgruppe" value={article.group?.name} />
                <DetailRow label="Rabattgruppe" value={article.discountGroup} />
                <DetailRow label="Bestellart" value={article.orderType} />
              </CardContent>
            </Card>

            {/* Prices */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-semibold mb-3">Preise</h3>
                <DetailRow label="VK-Preis (netto)" value={formatPrice(article.sellPrice)} />
                <DetailRow label="EK-Preis" value={formatPrice(article.buyPrice)} />
                <DetailRow label="MwSt-Satz" value={`${article.vatRate}%`} />
              </CardContent>
            </Card>

            {/* Stock Info */}
            {article.stockTracking && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-sm font-semibold mb-3">Bestand</h3>
                  <DetailRow label="Aktueller Bestand" value={article.currentStock} />
                  <DetailRow label="Mindestbestand" value={article.minStock ?? '\u2014'} />
                  <DetailRow label="Lagerort" value={article.warehouseLocation} />
                  {article.minStock != null && article.currentStock < article.minStock && (
                    <div className="mt-2 p-2 bg-destructive/10 text-destructive text-sm rounded-md">
                      Bestand unter Mindestbestand!
                    </div>
                  )}
                </CardContent>
              </Card>
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
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Bestandsbewegungen werden mit WH_04 implementiert.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prices" className="mt-4">
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Preislisten werden mit WH_02 implementiert.
            </CardContent>
          </Card>
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
        title="Artikel deaktivieren?"
        description={`Moechten Sie den Artikel "${article.name}" wirklich deaktivieren?`}
        confirmLabel="Deaktivieren"
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

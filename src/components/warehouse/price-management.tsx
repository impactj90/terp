'use client'

import * as React from 'react'
import { PriceListSelector } from './price-list-selector'
import { PriceListArticlesTable } from './price-list-articles-table'
import { PriceDetailEditor } from './price-detail-editor'
import { PriceBulkAdjustDialog } from './price-bulk-adjust-dialog'
import { PriceCopyDialog } from './price-copy-dialog'
import { Button } from '@/components/ui/button'
import { Percent, Copy } from 'lucide-react'
import { useWhPriceLists } from '@/hooks'
import { useWhPriceListArticles } from '@/hooks'
import { useHasPermission } from '@/hooks'
import { useTranslations } from 'next-intl'

export function PriceManagement() {
  const t = useTranslations('warehousePrices')
  const { allowed: canManage } = useHasPermission(['billing_price_lists.manage'])

  const [selectedPriceListId, setSelectedPriceListId] = React.useState<string | null>(null)
  const [selectedArticleId, setSelectedArticleId] = React.useState<string | null>(null)
  const [adjustDialogOpen, setAdjustDialogOpen] = React.useState(false)
  const [copyDialogOpen, setCopyDialogOpen] = React.useState(false)

  // Fetch price lists to resolve selected name (via warehouse router)
  const { data: priceLists } = useWhPriceLists({ isActive: true })
  const selectedPriceList = priceLists?.find(
    (pl: { id: string }) => pl.id === selectedPriceListId
  )

  // Fetch the price entries for the selected price list to find the selected entry's data
  const { data: entries } = useWhPriceListArticles(
    selectedPriceListId || '',
    undefined,
    !!selectedPriceListId
  )

  const selectedEntry = entries?.find(
    (e: { articleId: string | null }) => e.articleId === selectedArticleId
  )

  // Clear article selection when changing price list
  function handleSelectPriceList(id: string) {
    setSelectedPriceListId(id)
    setSelectedArticleId(null)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {canManage && selectedPriceListId && (
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdjustDialogOpen(true)}
          >
            <Percent className="h-4 w-4 mr-1" />
            {t('adjustPrices')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCopyDialogOpen(true)}
          >
            <Copy className="h-4 w-4 mr-1" />
            {t('copyPriceList')}
          </Button>
        </div>
      )}

      {/* Three-panel layout */}
      <div className="flex gap-4 h-[calc(100dvh-12rem)]">
        {/* Left: Price list selector */}
        <div className="w-64 shrink-0">
          <PriceListSelector
            selectedId={selectedPriceListId}
            onSelect={handleSelectPriceList}
            onDeselect={() => {
              setSelectedPriceListId(null)
              setSelectedArticleId(null)
            }}
            canManage={canManage === true}
          />
        </div>

        {/* Middle: Articles table */}
        <div className="flex-1 min-w-0">
          <PriceListArticlesTable
            priceListId={selectedPriceListId}
            selectedArticleId={selectedArticleId}
            onSelectArticle={setSelectedArticleId}
            canManage={canManage === true}
          />
        </div>

        {/* Right: Price detail editor */}
        <div className="w-80 shrink-0">
          <PriceDetailEditor
            priceListId={selectedPriceListId}
            articleId={selectedArticleId}
            entryData={selectedEntry ? {
              unitPrice: selectedEntry.unitPrice,
              minQuantity: selectedEntry.minQuantity,
              unit: selectedEntry.unit,
            } : null}
            canManage={canManage === true}
          />
        </div>
      </div>

      {/* Dialogs */}
      {selectedPriceListId && (
        <>
          <PriceBulkAdjustDialog
            open={adjustDialogOpen}
            onOpenChange={setAdjustDialogOpen}
            priceListId={selectedPriceListId}
          />
          <PriceCopyDialog
            open={copyDialogOpen}
            onOpenChange={setCopyDialogOpen}
            sourceId={selectedPriceListId}
            sourceName={selectedPriceList?.name ?? ''}
          />
        </>
      )}
    </div>
  )
}

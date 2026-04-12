'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { useHasPermission } from '@/hooks'
import {
  useWhArticles,
  useDeleteWhArticle,
  useRestoreWhArticle,
} from '@/hooks'
import {
  useGenerateLabelPdf,
  useGenerateAllLabelsPdf,
} from '@/hooks/use-wh-qr'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Pagination } from '@/components/ui/pagination'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ArticleList } from '@/components/warehouse/article-list'
import { ArticleFormSheet } from '@/components/warehouse/article-form-sheet'
import { ArticleGroupTree } from '@/components/warehouse/article-group-tree'

export default function WhArticlesPage() {
  const t = useTranslations('warehouseArticles')
  const router = useRouter()
  const { allowed: canAccess } = useHasPermission(['wh_articles.view'])
  const { allowed: canManageGroups } = useHasPermission(['wh_article_groups.manage'])

  // Pagination and filter state
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)
  const [activeFilter, setActiveFilter] = React.useState(true)
  const [belowMinStock, setBelowMinStock] = React.useState(false)

  // Selection state for QR label printing
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [confirmPrintAllOpen, setConfirmPrintAllOpen] = React.useState(false)

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editArticle, setEditArticle] = React.useState<Record<string, unknown> | null>(null)
  const [deleteArticle, setDeleteArticle] = React.useState<{ id: string; name: string } | null>(null)

  // Fetch data
  const { data, isLoading } = useWhArticles({
    page,
    pageSize: 25,
    search: search || undefined,
    groupId: selectedGroupId || undefined,
    isActive: activeFilter,
    belowMinStock: belowMinStock || undefined,
    enabled: canAccess !== false,
  })

  const deleteMutation = useDeleteWhArticle()
  const restoreMutation = useRestoreWhArticle()
  const generateLabelPdf = useGenerateLabelPdf()
  const generateAllLabelsPdf = useGenerateAllLabelsPdf()

  function handleView(article: { id: string }) {
    router.push(`/warehouse/articles/${article.id}`)
  }

  function handleDelete() {
    if (!deleteArticle) return
    deleteMutation.mutate(
      { id: deleteArticle.id },
      {
        onSuccess: () => {
          toast.success(t('toastDeactivated'))
          setDeleteArticle(null)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handlePrintLabels() {
    if (selectedIds.size > 0) {
      // Print selected articles
      toast.info(t('toastLabelPdfGenerating'))
      generateLabelPdf.mutate(
        { articleIds: Array.from(selectedIds) },
        {
          onSuccess: (result) => {
            if (result?.signedUrl) {
              toast.success(t('toastLabelPdfReady'))
              triggerPdfDownload(result.signedUrl, result.filename)
            }
          },
          onError: () => toast.error(t('toastLabelPdfError')),
        }
      )
    } else {
      // No selection -> confirm to print all
      setConfirmPrintAllOpen(true)
    }
  }

  function handlePrintAllConfirmed() {
    toast.info(t('toastLabelPdfGenerating'))
    generateAllLabelsPdf.mutate(
      { articleGroupId: selectedGroupId || undefined },
      {
        onSuccess: (result) => {
          if (result?.signedUrl) {
            toast.success(t('toastLabelPdfReady'))
            triggerPdfDownload(result.signedUrl, result.filename)
          }
          setConfirmPrintAllOpen(false)
        },
        onError: () => {
          toast.error(t('toastLabelPdfError'))
          setConfirmPrintAllOpen(false)
        },
      }
    )
  }

  function triggerPdfDownload(url: string, filename: string) {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function handleRestore(article: { id: string }) {
    restoreMutation.mutate(
      { id: article.id },
      {
        onSuccess: () => toast.success(t('toastRestored')),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  const totalPages = data ? Math.ceil(data.total / 25) : 0

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">{t('pageTitle')}</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintLabels}
            disabled={generateLabelPdf.isPending || generateAllLabelsPdf.isPending}
            className="sm:size-default"
          >
            <QrCode className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">
              {selectedIds.size > 0
                ? t('actionPrintLabels')
                : t('actionPrintAllLabels')}
            </span>
            <span className="sm:hidden">QR</span>
            {selectedIds.size > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({selectedIds.size})
              </span>
            )}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="sm:size-default">
            <Plus className="h-4 w-4 mr-2" />
            {t('actionCreate')}
          </Button>
        </div>
      </div>

      {/* Two-panel layout — sidebar hidden on mobile */}
      <div className="flex gap-6">
        {/* Left panel: Group tree — hidden on mobile */}
        <Card className="hidden md:block w-64 shrink-0">
          <CardContent className="p-3">
            <ArticleGroupTree
              selectedGroupId={selectedGroupId}
              onSelect={(id) => {
                setSelectedGroupId(id)
                setPage(1)
              }}
              canManage={canManageGroups !== false}
            />
          </CardContent>
        </Card>

        {/* Right panel: Article table */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val)
                setPage(1)
              }}
              placeholder={t('searchPlaceholder')}
              className="w-full sm:max-w-sm"
            />
            <div className="flex items-center gap-2">
              <Label htmlFor="activeFilter" className="text-sm whitespace-nowrap">
                {t('filterActiveOnly')}
              </Label>
              <Switch
                id="activeFilter"
                checked={activeFilter}
                onCheckedChange={(checked) => {
                  setActiveFilter(checked)
                  setPage(1)
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="belowMinFilter" className="text-sm whitespace-nowrap">
                {t('filterBelowMinStock')}
              </Label>
              <Switch
                id="belowMinFilter"
                checked={belowMinStock}
                onCheckedChange={(checked) => {
                  setBelowMinStock(checked)
                  setPage(1)
                }}
              />
            </div>
          </div>

          {/* Data table */}
          <Card>
            <CardContent className="p-0">
              <ArticleList
                articles={(data?.items || []) as Array<{
                  id: string
                  number: string
                  name: string
                  unit: string
                  sellPrice: number | null
                  currentStock: number
                  stockTracking: boolean
                  isActive: boolean
                  group?: { id: string; name: string } | null
                }>}
                isLoading={isLoading}
                onView={handleView}
                onEdit={(article) => setEditArticle(article as unknown as Record<string, unknown>)}
                onDelete={(article) => setDeleteArticle({ id: article.id, name: article.name })}
                onRestore={handleRestore}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={data?.total || 0}
              limit={25}
              onPageChange={setPage}
              onLimitChange={() => {}}
            />
          )}
        </div>
      </div>

      {/* Create/Edit sheet */}
      <ArticleFormSheet
        open={createOpen || !!editArticle}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditArticle(null)
          }
        }}
        article={editArticle}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteArticle}
        onOpenChange={() => setDeleteArticle(null)}
        title={t('confirmDeactivateTitle')}
        description={t('confirmDeactivateDescription', { name: deleteArticle?.name ?? '' })}
        confirmLabel={t('actionDeactivate')}
        onConfirm={handleDelete}
        variant="destructive"
      />

      {/* Print all labels confirmation */}
      <ConfirmDialog
        open={confirmPrintAllOpen}
        onOpenChange={setConfirmPrintAllOpen}
        title={t('confirmPrintAllTitle')}
        description={t('confirmPrintAllDescription')}
        confirmLabel={t('actionPrintAllLabels')}
        onConfirm={handlePrintAllConfirmed}
      />
    </div>
  )
}

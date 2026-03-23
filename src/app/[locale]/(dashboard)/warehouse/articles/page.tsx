'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useHasPermission } from '@/hooks'
import {
  useWhArticles,
  useDeleteWhArticle,
  useRestoreWhArticle,
} from '@/hooks'
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
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('actionCreate')}
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6">
        {/* Left panel: Group tree */}
        <Card className="w-64 shrink-0">
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
        <div className="flex-1 space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-4">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val)
                setPage(1)
              }}
              placeholder={t('searchPlaceholder')}
              className="max-w-sm"
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
    </div>
  )
}

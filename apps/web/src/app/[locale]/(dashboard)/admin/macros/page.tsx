'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Repeat, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useMacros, useDeleteMacro, useUpdateMacro } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { MacroDataTable, MacroFormSheet } from '@/components/macros'
import type { components } from '@/lib/api/types'

type Macro = components['schemas']['schema1']

export default function MacrosPage() {
  const router = useRouter()
  const t = useTranslations('adminMacros')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['macros.manage'])

  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Macro | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<Macro | null>(null)

  const { data, isLoading } = useMacros({ enabled: !authLoading && !permLoading && canAccess })
  const deleteMutation = useDeleteMacro()
  const updateMutation = useUpdateMacro()

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const macros = data?.data ?? []

  const filteredItems = React.useMemo(() => {
    if (!search) return macros
    const query = search.toLowerCase()
    return macros.filter(
      (item) =>
        item.name?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
    )
  }, [macros, search])

  const handleView = (item: Macro) => {
    router.push(`/admin/macros/${item.id}`)
  }

  const handleEdit = (item: Macro) => {
    setEditItem(item)
  }

  const handleDelete = async () => {
    if (!deleteItem) return
    await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
    setDeleteItem(null)
  }

  const handleToggleActive = async (item: Macro, active: boolean) => {
    await updateMutation.mutateAsync({
      path: { id: item.id },
      body: { is_active: active },
    })
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  if (authLoading || permLoading) {
    return <MacrosPageSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newMacro')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:w-64"
        />
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
            <X className="mr-2 h-4 w-4" />
            {t('clearFilters')}
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredItems.length === 1
          ? t('macroCount', { count: filteredItems.length })
          : t('macrosCount', { count: filteredItems.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : filteredItems.length === 0 ? (
            <MacroEmptyState
              hasFilters={!!search}
              onCreateClick={() => setCreateOpen(true)}
            />
          ) : (
            <MacroDataTable
              items={filteredItems}
              isLoading={false}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={setDeleteItem}
              onToggleActive={handleToggleActive}
            />
          )}
        </CardContent>
      </Card>

      <MacroFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        macro={editItem}
        onSuccess={handleFormSuccess}
      />

      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => !open && setDeleteItem(null)}
        title={t('deleteMacro')}
        description={deleteItem ? t('deleteDescription', { name: deleteItem.name }) : ''}
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function MacroEmptyState({
  hasFilters = false,
  onCreateClick,
}: {
  hasFilters?: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminMacros')
  return (
    <div className="text-center py-12 px-6">
      <Repeat className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters ? t('emptyFilterHint') : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newMacro')}
        </Button>
      )}
    </div>
  )
}

function MacrosPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
      </div>

      <Skeleton className="h-[400px]" />
    </div>
  )
}

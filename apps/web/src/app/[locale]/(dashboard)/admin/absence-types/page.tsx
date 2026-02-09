'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, CalendarOff, X, FolderOpen } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useAbsenceTypes,
  useDeleteAbsenceType,
  useAbsenceTypeGroups,
  useDeleteAbsenceTypeGroup,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AbsenceTypeDataTable,
  AbsenceTypeFormSheet,
  AbsenceTypeDetailSheet,
} from '@/components/absence-types'
import {
  AbsenceTypeGroupDataTable,
  AbsenceTypeGroupFormSheet,
} from '@/components/absence-type-groups'
import type { components } from '@/lib/api/types'

type AbsenceType = components['schemas']['AbsenceType']
type AbsenceTypeGroup = components['schemas']['AbsenceTypeGroup']

const CATEGORY_OPTIONS = [
  { value: 'all', labelKey: 'allCategories' },
  { value: 'vacation', labelKey: 'categoryVacation' },
  { value: 'sick', labelKey: 'categorySick' },
  { value: 'personal', labelKey: 'categoryPersonal' },
  { value: 'unpaid', labelKey: 'categoryUnpaid' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'allStatuses' },
  { value: 'active', labelKey: 'active' },
  { value: 'inactive', labelKey: 'inactive' },
] as const

export default function AbsenceTypesPage() {
  const router = useRouter()
  const t = useTranslations('adminAbsenceTypes')
  const tGroups = useTranslations('adminAbsenceTypeGroups')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['absence_types.manage'])

  // Tab state
  const [activeTab, setActiveTab] = React.useState<'absence-types' | 'groups'>('absence-types')

  // Absence types filters
  const [search, setSearch] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [showSystem, setShowSystem] = React.useState(true)

  // Absence types dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<AbsenceType | null>(null)
  const [viewItem, setViewItem] = React.useState<AbsenceType | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<AbsenceType | null>(null)

  // Groups state
  const [groupSearch, setGroupSearch] = React.useState('')
  const [createGroupOpen, setCreateGroupOpen] = React.useState(false)
  const [editGroupItem, setEditGroupItem] = React.useState<AbsenceTypeGroup | null>(null)
  const [deleteGroupItem, setDeleteGroupItem] = React.useState<AbsenceTypeGroup | null>(null)

  // Fetch absence types
  const { data: absenceTypesData, isLoading } = useAbsenceTypes(!authLoading && !permLoading && canAccess)

  // Fetch absence type groups
  const { data: groupsData, isLoading: groupsLoading } = useAbsenceTypeGroups({
    enabled: !authLoading && !permLoading && canAccess,
  })

  // Mutations
  const deleteMutation = useDeleteAbsenceType()
  const deleteGroupMutation = useDeleteAbsenceTypeGroup()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const absenceTypes = absenceTypesData?.data ?? []
  const absenceTypeGroupsList = (groupsData as { data?: AbsenceTypeGroup[] })?.data ?? []

  // Filter absence types client-side
  const filteredTypes = React.useMemo(() => {
    return absenceTypes.filter((t) => {
      if (search) {
        const searchLower = search.toLowerCase()
        if (
          !t.code?.toLowerCase().includes(searchLower) &&
          !t.name?.toLowerCase().includes(searchLower)
        ) {
          return false
        }
      }
      if (categoryFilter !== 'all' && t.category !== categoryFilter) {
        return false
      }
      if (statusFilter === 'active' && !t.is_active) return false
      if (statusFilter === 'inactive' && t.is_active) return false
      if (!showSystem && t.is_system) return false
      return true
    })
  }, [absenceTypes, search, categoryFilter, statusFilter, showSystem])

  // Filter groups client-side
  const filteredGroups = React.useMemo(() => {
    if (!groupSearch) return absenceTypeGroupsList
    const s = groupSearch.toLowerCase()
    return absenceTypeGroupsList.filter(
      (g) => g.code?.toLowerCase().includes(s) || g.name?.toLowerCase().includes(s)
    )
  }, [absenceTypeGroupsList, groupSearch])

  const handleView = (type: AbsenceType) => {
    setViewItem(type)
  }

  const handleEdit = (type: AbsenceType) => {
    setEditItem(type)
    setViewItem(null)
  }

  const handleDelete = (type: AbsenceType) => {
    setDeleteItem(type)
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteItem.id },
      })
      setDeleteItem(null)
      setViewItem(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const handleGroupFormSuccess = () => {
    setCreateGroupOpen(false)
    setEditGroupItem(null)
  }

  const handleConfirmDeleteGroup = async () => {
    if (!deleteGroupItem) return

    try {
      await deleteGroupMutation.mutateAsync({
        path: { id: deleteGroupItem.id },
      })
      setDeleteGroupItem(null)
    } catch {
      // Error handled by mutation
    }
  }

  const hasFilters = Boolean(search || categoryFilter !== 'all' || statusFilter !== 'all' || !showSystem)

  const clearFilters = () => {
    setSearch('')
    setCategoryFilter('all')
    setStatusFilter('all')
    setShowSystem(true)
  }

  if (authLoading || permLoading) {
    return <AbsenceTypesPageSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Button onClick={() => activeTab === 'groups' ? setCreateGroupOpen(true) : setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {activeTab === 'groups' ? tGroups('newGroup') : t('newAbsenceType')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'absence-types' | 'groups')}>
        <TabsList>
          <TabsTrigger value="absence-types">{t('tabAbsenceTypes')}</TabsTrigger>
          <TabsTrigger value="groups">{t('tabGroups')}</TabsTrigger>
        </TabsList>

        <TabsContent value="absence-types" className="space-y-6">
          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-4">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('searchPlaceholder')}
              className="w-full sm:w-64"
            />

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center space-x-2">
              <Switch
                id="show-system"
                checked={showSystem}
                onCheckedChange={setShowSystem}
              />
              <Label htmlFor="show-system" className="text-sm">
                {t('showSystemTypes')}
              </Label>
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                {t('clearFilters')}
              </Button>
            )}
          </div>

          {/* Count display */}
          <div className="text-sm text-muted-foreground">
            {filteredTypes.length === 1
              ? t('absenceTypeCount', { count: filteredTypes.length })
              : t('absenceTypesCount', { count: filteredTypes.length })}
          </div>

          {/* Content */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6">
                  <Skeleton className="h-64" />
                </div>
              ) : filteredTypes.length === 0 ? (
                <EmptyState
                  hasFilters={hasFilters}
                  onCreateClick={() => setCreateOpen(true)}
                />
              ) : (
                <AbsenceTypeDataTable
                  absenceTypes={filteredTypes}
                  isLoading={false}
                  onView={handleView}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups" className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <SearchInput
              value={groupSearch}
              onChange={setGroupSearch}
              placeholder={tGroups('searchPlaceholder')}
              className="w-full sm:w-64"
            />
            {groupSearch && (
              <Button variant="ghost" size="sm" onClick={() => setGroupSearch('')}>
                <X className="mr-2 h-4 w-4" />
                {tGroups('clearFilters')}
              </Button>
            )}
          </div>

          {/* Count */}
          <div className="text-sm text-muted-foreground">
            {filteredGroups.length === 1
              ? tGroups('groupCount', { count: filteredGroups.length })
              : tGroups('groupsCount', { count: filteredGroups.length })}
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {groupsLoading ? (
                <div className="p-6"><Skeleton className="h-64" /></div>
              ) : filteredGroups.length === 0 ? (
                <GroupEmptyState hasFilters={!!groupSearch} onCreateClick={() => setCreateGroupOpen(true)} />
              ) : (
                <AbsenceTypeGroupDataTable
                  groups={filteredGroups}
                  isLoading={false}
                  onEdit={(g) => setEditGroupItem(g)}
                  onDelete={(g) => setDeleteGroupItem(g)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Absence Type Create/Edit Form */}
      <AbsenceTypeFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        absenceType={editItem}
        onSuccess={handleFormSuccess}
      />

      {/* Absence Type Detail View */}
      <AbsenceTypeDetailSheet
        absenceTypeId={viewItem?.id ?? null}
        open={!!viewItem}
        onOpenChange={(open) => {
          if (!open) {
            setViewItem(null)
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Absence Type Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteItem(null)
          }
        }}
        title={t('deleteAbsenceType')}
        description={
          deleteItem
            ? t('deleteDescription', { name: deleteItem.name, code: deleteItem.code })
            : ''
        }
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />

      {/* Group Create/Edit Form */}
      <AbsenceTypeGroupFormSheet
        open={createGroupOpen || !!editGroupItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateGroupOpen(false)
            setEditGroupItem(null)
          }
        }}
        group={editGroupItem}
        onSuccess={handleGroupFormSuccess}
      />

      {/* Group Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteGroupItem}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteGroupItem(null)
          }
        }}
        title={tGroups('deleteGroup')}
        description={
          deleteGroupItem
            ? tGroups('deleteDescription', { name: deleteGroupItem.name, code: deleteGroupItem.code })
            : ''
        }
        confirmLabel={tGroups('delete')}
        variant="destructive"
        isLoading={deleteGroupMutation.isPending}
        onConfirm={handleConfirmDeleteGroup}
      />
    </div>
  )
}

function EmptyState({
  hasFilters = false,
  onCreateClick,
}: {
  hasFilters?: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminAbsenceTypes')
  return (
    <div className="text-center py-12 px-6">
      <CalendarOff className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addAbsenceType')}
        </Button>
      )}
    </div>
  )
}

function GroupEmptyState({
  hasFilters = false,
  onCreateClick,
}: {
  hasFilters?: boolean
  onCreateClick: () => void
}) {
  const t = useTranslations('adminAbsenceTypeGroups')
  return (
    <div className="text-center py-12 px-6">
      <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? t('emptyFilterHint')
          : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addGroup')}
        </Button>
      )}
    </div>
  )
}

function AbsenceTypesPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Content */}
      <Skeleton className="h-[400px]" />
    </div>
  )
}

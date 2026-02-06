'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Clock, ArrowDownLeft, ArrowUpRight, X, FolderOpen } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useBookingTypes,
  useUpdateBookingType,
  useDeleteBookingType,
  useBookingTypeGroups,
  useDeleteBookingTypeGroup,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BookingTypeDataTable,
  BookingTypeFormSheet,
} from '@/components/booking-types'
import {
  BookingTypeGroupDataTable,
  BookingTypeGroupFormSheet,
} from '@/components/booking-type-groups'
import type { components } from '@/lib/api/types'

type BookingType = components['schemas']['BookingType']
type BookingTypeGroup = components['schemas']['BookingTypeGroup']

type DirectionFilter = 'all' | 'in' | 'out'

export default function BookingTypesPage() {
  const router = useRouter()
  const t = useTranslations('adminBookingTypes')
  const tGroups = useTranslations('adminBookingTypeGroups')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Page-level tab state
  const [activeTab, setActiveTab] = React.useState<'booking-types' | 'groups'>('booking-types')

  // Booking types state
  const [search, setSearch] = React.useState('')
  const [directionFilter, setDirectionFilter] = React.useState<DirectionFilter>('all')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<BookingType | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<BookingType | null>(null)
  const [togglingId, setTogglingId] = React.useState<string | null>(null)

  // Groups state
  const [groupSearch, setGroupSearch] = React.useState('')
  const [createGroupOpen, setCreateGroupOpen] = React.useState(false)
  const [editGroupItem, setEditGroupItem] = React.useState<BookingTypeGroup | null>(null)
  const [deleteGroupItem, setDeleteGroupItem] = React.useState<BookingTypeGroup | null>(null)

  // Data fetching
  const { data: bookingTypesData, isLoading } = useBookingTypes({
    enabled: !authLoading && isAdmin,
  })
  const { data: groupsData, isLoading: groupsLoading } = useBookingTypeGroups({
    enabled: !authLoading && isAdmin,
  })

  // Mutations
  const updateMutation = useUpdateBookingType()
  const deleteMutation = useDeleteBookingType()
  const deleteGroupMutation = useDeleteBookingTypeGroup()

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const bookingTypes = bookingTypesData?.data ?? []
  const bookingTypeGroupsList = (groupsData as { data?: BookingTypeGroup[] })?.data ?? []

  const filteredTypes = React.useMemo(() => {
    return bookingTypes.filter((type) => {
      if (search) {
        const searchLower = search.toLowerCase()
        if (
          !type.code?.toLowerCase().includes(searchLower) &&
          !type.name?.toLowerCase().includes(searchLower)
        ) {
          return false
        }
      }
      if (directionFilter !== 'all' && type.direction !== directionFilter) {
        return false
      }
      return true
    })
  }, [bookingTypes, search, directionFilter])

  const filteredGroups = React.useMemo(() => {
    if (!groupSearch) return bookingTypeGroupsList
    const s = groupSearch.toLowerCase()
    return bookingTypeGroupsList.filter(
      (g) => g.code?.toLowerCase().includes(s) || g.name?.toLowerCase().includes(s)
    )
  }, [bookingTypeGroupsList, groupSearch])

  const handleEdit = (type: BookingType) => {
    setEditItem(type)
  }

  const handleDelete = (type: BookingType) => {
    setDeleteItem(type)
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteItem.id },
      })
      setDeleteItem(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleToggleActive = async (type: BookingType, isActive: boolean) => {
    setTogglingId(type.id)
    try {
      await updateMutation.mutateAsync({
        path: { id: type.id },
        body: { is_active: isActive },
      })
    } catch {
      // Error handled by mutation
    } finally {
      setTogglingId(null)
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

  const hasFilters = Boolean(search || directionFilter !== 'all')

  if (authLoading) {
    return <BookingTypesPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => activeTab === 'groups' ? setCreateGroupOpen(true) : setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {activeTab === 'groups' ? tGroups('newGroup') : t('newBookingType')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'booking-types' | 'groups')}>
        <TabsList>
          <TabsTrigger value="booking-types">{t('tabBookingTypes')}</TabsTrigger>
          <TabsTrigger value="groups">{t('tabGroups')}</TabsTrigger>
        </TabsList>

        <TabsContent value="booking-types" className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('searchPlaceholder')}
              className="w-full sm:w-64"
            />

            <Tabs value={directionFilter} onValueChange={(v) => setDirectionFilter(v as DirectionFilter)}>
              <TabsList>
                <TabsTrigger value="all">{t('filterAll')}</TabsTrigger>
                <TabsTrigger value="in">
                  <ArrowDownLeft className="mr-2 h-4 w-4" />
                  {t('directionIn')}
                </TabsTrigger>
                <TabsTrigger value="out">
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  {t('directionOut')}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setDirectionFilter('all')
                }}
              >
                <X className="mr-2 h-4 w-4" />
                {t('clearFilters')}
              </Button>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            {filteredTypes.length === 1
              ? t('bookingTypeCount', { count: filteredTypes.length })
              : t('bookingTypesCount', { count: filteredTypes.length })}
          </div>

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
                <BookingTypeDataTable
                  bookingTypes={filteredTypes}
                  isLoading={false}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                  togglingId={togglingId}
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
                <BookingTypeGroupDataTable
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

      {/* Booking Type Form */}
      <BookingTypeFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        bookingType={editItem}
        onSuccess={handleFormSuccess}
      />

      {/* Booking Type Delete */}
      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteItem(null)
          }
        }}
        title={t('deleteBookingType')}
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
      <BookingTypeGroupFormSheet
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
  const t = useTranslations('adminBookingTypes')
  return (
    <div className="text-center py-12 px-6">
      <Clock className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters ? t('emptyFilterHint') : t('emptyGetStarted')}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addBookingType')}
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
  const t = useTranslations('adminBookingTypeGroups')
  return (
    <div className="text-center py-12 px-6">
      <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">{t('emptyTitle')}</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters ? t('emptyFilterHint') : t('emptyGetStarted')}
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

function BookingTypesPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-56" />
      </div>

      <Skeleton className="h-[400px]" />
    </div>
  )
}

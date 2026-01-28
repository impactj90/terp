'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Clock, ArrowDownLeft, ArrowUpRight, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useBookingTypes,
  useUpdateBookingType,
  useDeleteBookingType,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BookingTypeDataTable,
  BookingTypeFormSheet,
} from '@/components/booking-types'
import type { components } from '@/lib/api/types'

type BookingType = components['schemas']['BookingType']

type DirectionFilter = 'all' | 'in' | 'out'

export default function BookingTypesPage() {
  const router = useRouter()
  const t = useTranslations('adminBookingTypes')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  const [search, setSearch] = React.useState('')
  const [directionFilter, setDirectionFilter] = React.useState<DirectionFilter>('all')

  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<BookingType | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<BookingType | null>(null)
  const [togglingId, setTogglingId] = React.useState<string | null>(null)

  const { data: bookingTypesData, isLoading } = useBookingTypes({
    enabled: !authLoading && isAdmin,
  })

  const updateMutation = useUpdateBookingType()
  const deleteMutation = useDeleteBookingType()

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const bookingTypes = bookingTypesData?.data ?? []

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
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newBookingType')}
        </Button>
      </div>

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

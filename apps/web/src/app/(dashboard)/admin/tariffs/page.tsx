'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useTariffs, useDeleteTariff } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TariffDataTable,
  TariffFormSheet,
  TariffDetailSheet,
  CopyTariffDialog,
} from '@/components/tariffs'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']

export default function TariffsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filters
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTariff, setEditTariff] = React.useState<Tariff | null>(null)
  const [viewTariff, setViewTariff] = React.useState<Tariff | null>(null)
  const [deleteTariff, setDeleteTariff] = React.useState<Tariff | null>(null)
  const [copyTariff, setCopyTariff] = React.useState<Tariff | null>(null)

  // Fetch tariffs
  const { data, isLoading, isFetching } = useTariffs({
    active: activeFilter,
    enabled: !authLoading && isAdmin,
  })

  // Delete mutation
  const deleteMutation = useDeleteTariff()

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const tariffs = React.useMemo(() => {
    let list = data?.data ?? []
    if (search) {
      const searchLower = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.code.toLowerCase().includes(searchLower) ||
          t.name.toLowerCase().includes(searchLower)
      )
    }
    return list
  }, [data?.data, search])

  const handleView = (tariff: Tariff) => {
    setViewTariff(tariff)
  }

  const handleEdit = (tariff: Tariff) => {
    setEditTariff(tariff)
    setViewTariff(null)
  }

  const handleDelete = (tariff: Tariff) => {
    setDeleteTariff(tariff)
  }

  const handleCopy = (tariff: Tariff) => {
    setCopyTariff(tariff)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTariff) return
    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteTariff.id },
      })
      setDeleteTariff(null)
      setViewTariff(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditTariff(null)
  }

  const hasFilters = Boolean(search) || activeFilter !== undefined

  if (authLoading) {
    return <TariffsPageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tariffs</h1>
          <p className="text-muted-foreground">
            Manage employment contract tariffs and break rules
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Tariff
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by code or name..."
          className="w-full sm:w-64"
          disabled={isFetching}
        />

        <Select
          value={activeFilter === undefined ? 'all' : activeFilter ? 'active' : 'inactive'}
          onValueChange={(value) => {
            if (value === 'all') setActiveFilter(undefined)
            else setActiveFilter(value === 'active')
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setActiveFilter(undefined)
            }}
          >
            <X className="mr-2 h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : tariffs.length === 0 ? (
            <EmptyState hasFilters={hasFilters} onCreateClick={() => setCreateOpen(true)} />
          ) : (
            <TariffDataTable
              tariffs={tariffs}
              isLoading={isLoading}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCopy={handleCopy}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form */}
      <TariffFormSheet
        open={createOpen || !!editTariff}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditTariff(null)
          }
        }}
        tariff={editTariff}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <TariffDetailSheet
        tariffId={viewTariff?.id ?? null}
        open={!!viewTariff}
        onOpenChange={(open) => {
          if (!open) setViewTariff(null)
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCopy={handleCopy}
      />

      {/* Copy Dialog */}
      <CopyTariffDialog
        tariff={copyTariff}
        open={!!copyTariff}
        onOpenChange={(open) => {
          if (!open) setCopyTariff(null)
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTariff}
        onOpenChange={(open) => {
          if (!open) setDeleteTariff(null)
        }}
        title="Delete Tariff"
        description={
          deleteTariff
            ? `Are you sure you want to delete "${deleteTariff.name}" (${deleteTariff.code})? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function EmptyState({
  hasFilters,
  onCreateClick,
}: {
  hasFilters: boolean
  onCreateClick: () => void
}) {
  return (
    <div className="text-center py-12 px-6">
      <FileText className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">No tariffs found</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? 'Try adjusting your search or filters'
          : 'Get started by creating your first tariff'}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Create Tariff
        </Button>
      )}
    </div>
  )
}

function TariffsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}

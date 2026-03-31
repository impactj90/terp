'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, X, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { useHasPermission } from '@/hooks'
import {
  useCrmAddresses,
  useDeleteCrmAddress,
  useRestoreCrmAddress,
} from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Pagination } from '@/components/ui/pagination'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AddressDataTable } from '@/components/crm/address-data-table'
import { AddressFormSheet } from '@/components/crm/address-form-sheet'

type AddressType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH'

export default function CrmAddressesPage() {
  const t = useTranslations('crmAddresses')
  const router = useRouter()
  const { allowed: canAccess } = useHasPermission(['crm_addresses.view'])

  // Pagination and filter state
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<AddressType | undefined>(undefined)
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(true)

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editAddress, setEditAddress] = React.useState<Record<string, unknown> | null>(null)
  const [deleteAddress, setDeleteAddress] = React.useState<{ id: string; company: string } | null>(null)

  // Selection
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  // Fetch data
  const { data, isLoading } = useCrmAddresses({
    page,
    pageSize: 25,
    search: search || undefined,
    type: typeFilter,
    isActive: activeFilter,
    enabled: canAccess !== false,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 25)

  const deleteMutation = useDeleteCrmAddress()
  const restoreMutation = useRestoreCrmAddress()

  // Reset page on filter change
  React.useEffect(() => {
    setPage(1)
  }, [search, typeFilter, activeFilter])

  // Clear selection on page change
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [page])

  const hasFilters = !!search || typeFilter !== undefined || activeFilter !== true

  const clearFilters = () => {
    setSearch('')
    setTypeFilter(undefined)
    setActiveFilter(true)
  }

  const handleView = (address: { id: string }) => {
    router.push(`/crm/addresses/${address.id}`)
  }

  const handleConfirmDelete = async () => {
    if (!deleteAddress) return
    try {
      await deleteMutation.mutateAsync({ id: deleteAddress.id })
      toast.success(t('deactivate'))
      setDeleteAddress(null)
    } catch {
      toast.error(t('deactivateFailed'))
    }
  }

  const handleRestore = async (address: { id: string }) => {
    try {
      await restoreMutation.mutateAsync({ id: address.id })
      toast.success(t('restore'))
    } catch {
      toast.error(t('deactivateFailed'))
    }
  }

  if (canAccess === false) {
    return null
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
          <Plus className="mr-2 h-4 w-4" />
          {t('newAddress')}
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('searchPlaceholder')}
          className="w-full sm:w-80"
        />

        <div className="flex gap-2">
          <Select
            value={typeFilter ?? 'all'}
            onValueChange={(v) => setTypeFilter(v === 'all' ? undefined : (v as AddressType))}
          >
            <SelectTrigger className="flex-1 sm:w-[160px]">
              <SelectValue placeholder={t('allTypes')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allTypes')}</SelectItem>
              <SelectItem value="CUSTOMER">{t('typeCustomer')}</SelectItem>
              <SelectItem value="SUPPLIER">{t('typeSupplier')}</SelectItem>
              <SelectItem value="BOTH">{t('typeBoth')}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={activeFilter === undefined ? 'all' : activeFilter ? 'active' : 'inactive'}
            onValueChange={(v) => {
              if (v === 'all') setActiveFilter(undefined)
              else if (v === 'active') setActiveFilter(true)
              else setActiveFilter(false)
            }}
          >
            <SelectTrigger className="flex-1 sm:w-[140px]">
              <SelectValue placeholder={t('allStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allStatus')}</SelectItem>
              <SelectItem value="active">{t('active')}</SelectItem>
              <SelectItem value="inactive">{t('inactive')}</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Data table in card */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-96 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">{t('emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {hasFilters ? t('emptyFilterHint') : t('emptyGetStarted')}
              </p>
              {!hasFilters && (
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('addAddress')}
                </Button>
              )}
            </div>
          ) : (
            <AddressDataTable
              addresses={items}
              isLoading={false}
              selectedIds={selectedIds}
              onSelectIds={setSelectedIds}
              onView={handleView}
              onEdit={(a) => setEditAddress(a as unknown as Record<string, unknown>)}
              onDelete={(a) => setDeleteAddress({ id: a.id, company: a.company })}
              onRestore={handleRestore}
            />
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={25}
          onPageChange={setPage}
          onLimitChange={() => {}}
        />
      )}

      {/* Create/Edit Sheet */}
      <AddressFormSheet
        open={createOpen || !!editAddress}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditAddress(null)
          }
        }}
        address={editAddress as Parameters<typeof AddressFormSheet>[0]['address']}
        onSuccess={() => {
          setCreateOpen(false)
          setEditAddress(null)
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteAddress}
        onOpenChange={(open) => !open && setDeleteAddress(null)}
        title={t('deactivateAddress')}
        description={t('deactivateDescription', { company: deleteAddress?.company ?? '' })}
        confirmLabel={t('confirm')}
        onConfirm={handleConfirmDelete}
        variant="destructive"
      />
    </div>
  )
}

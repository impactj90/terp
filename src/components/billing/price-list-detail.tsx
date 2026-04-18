'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Copy, Pencil, Percent, Star, Trash2 } from 'lucide-react'
import {
  useBillingPriceList,
  useDeleteBillingPriceList,
  useSetDefaultBillingPriceList,
} from '@/hooks'
import { PriceListFormSheet } from './price-list-form-sheet'
import { PriceListEntriesTable } from './price-list-entries-table'
import { PriceListBulkAdjustDialog } from './price-list-bulk-adjust-dialog'
import { PriceListCopyDialog } from './price-list-copy-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

function formatDate(date: string | Date | null): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

interface PriceListDetailProps {
  id: string
}

export function PriceListDetail({ id }: PriceListDetailProps) {
  const router = useRouter()
  const t = useTranslations('billingPriceLists')
  const { data: pl, isLoading } = useBillingPriceList(id)
  const deleteMutation = useDeleteBillingPriceList()
  const setDefaultMutation = useSetDefaultBillingPriceList()

  const [showEditSheet, setShowEditSheet] = React.useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)
  const [showAdjustDialog, setShowAdjustDialog] = React.useState(false)
  const [showCopyDialog, setShowCopyDialog] = React.useState(false)

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">{t('loading')}</div>
  }

  if (!pl) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">{t('notFound')}</div>
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: pl.id })
      toast.success(t('priceListDeleted'))
      router.push('/orders/price-lists')
    } catch (err) {
      const message = err instanceof Error ? err.message : t('deleteError')
      toast.error(message)
    }
  }

  const handleSetDefault = async () => {
    try {
      await setDefaultMutation.mutateAsync({ id: pl.id })
      toast.success(t('setAsDefaultSuccess'))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('error')
      toast.error(message)
    }
  }

  const typedPl = pl as typeof pl & {
    salesAddresses?: Array<{ id: string; number: string; company?: string }>
    purchaseAddresses?: Array<{ id: string; number: string; company?: string }>
  }
  const allAddresses = [
    ...(typedPl.salesAddresses ?? []),
    ...(typedPl.purchaseAddresses ?? []),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/orders/price-lists')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t('back')}
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{pl.name}</h2>
            {pl.isDefault && (
              <Badge variant="default" className="gap-1">
                <Star className="h-3 w-3 fill-current" />
                {t('default')}
              </Badge>
            )}
            <Badge variant={pl.isActive ? 'default' : 'secondary'}>
              {pl.isActive ? t('active') : t('inactive')}
            </Badge>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowEditSheet(true)}>
          <Pencil className="h-4 w-4 mr-1" />
          {t('edit')}
        </Button>
        {!pl.isDefault && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSetDefault}
            disabled={setDefaultMutation.isPending}
          >
            <Star className="h-4 w-4 mr-1" />
            {t('setAsDefault')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdjustDialog(true)}
        >
          <Percent className="h-4 w-4 mr-1" />
          {t('adjustPrices')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCopyDialog(true)}
        >
          <Copy className="h-4 w-4 mr-1" />
          {t('copyPriceList')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDeleteDialog(true)}
          className="text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {t('delete')}
        </Button>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {pl.description && (
              <DetailRow label={t('description')} value={pl.description} />
            )}
            <DetailRow label={t('validFrom')} value={formatDate(pl.validFrom)} />
            <DetailRow label={t('validTo')} value={formatDate(pl.validTo)} />
            <DetailRow
              label={t('default')}
              value={pl.isDefault ? t('yes') : t('no')}
            />
            <DetailRow
              label={t('status')}
              value={pl.isActive ? t('active') : t('inactive')}
            />
          </CardContent>
        </Card>

        {/* Assigned Customers Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('assignedCustomers')}</CardTitle>
          </CardHeader>
          <CardContent>
            {allAddresses.length > 0 ? (
              <ul className="space-y-1">
                {allAddresses.map((addr) => (
                  <li key={addr.id} className="text-sm">
                    <span className="font-mono text-muted-foreground">{addr.number}</span>
                    {' '}
                    {addr.company || '-'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noCustomersAssigned')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('priceEntries')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PriceListEntriesTable priceListId={id} />
        </CardContent>
      </Card>

      {/* Dialogs */}
      <PriceListFormSheet
        open={showEditSheet}
        onOpenChange={setShowEditSheet}
        editItem={pl as unknown as Record<string, unknown>}
      />

      <PriceListBulkAdjustDialog
        open={showAdjustDialog}
        onOpenChange={setShowAdjustDialog}
        priceListId={pl.id}
      />

      <PriceListCopyDialog
        open={showCopyDialog}
        onOpenChange={setShowCopyDialog}
        sourceId={pl.id}
        sourceName={pl.name}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t('deletePriceList')}
        description={t('deletePriceListDescription', { name: pl.name })}
        onConfirm={handleDelete}
        confirmLabel={t('delete')}
        variant="destructive"
      />
    </div>
  )
}

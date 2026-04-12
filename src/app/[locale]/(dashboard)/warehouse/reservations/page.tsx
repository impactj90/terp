'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission, useWhReservations, useReleaseWhReservation, useReleaseWhReservationsBulk } from '@/hooks'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('warehouseReservations')
  const variantMap: Record<string, 'blue' | 'gray' | 'green'> = {
    ACTIVE: 'blue',
    RELEASED: 'gray',
    FULFILLED: 'green',
  }
  const labels: Record<string, string> = {
    ACTIVE: t('statusActive'),
    RELEASED: t('statusReleased'),
    FULFILLED: t('statusFulfilled'),
  }
  return (
    <Badge variant={variantMap[status] ?? 'gray'}>
      {labels[status] ?? status}
    </Badge>
  )
}

export default function WhReservationsPage() {
  const t = useTranslations('warehouseReservations')
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['wh_reservations.view'])
  const { allowed: canManage } = useHasPermission(['wh_reservations.manage'])

  const [statusFilter, setStatusFilter] = React.useState<'ACTIVE' | 'RELEASED' | 'FULFILLED' | 'ALL'>('ACTIVE')
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useWhReservations({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    page,
    pageSize: 25,
  })

  const releaseMut = useReleaseWhReservation()
  const releaseBulkMut = useReleaseWhReservationsBulk()

  const [releaseDialogOpen, setReleaseDialogOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [bulkDocumentId, setBulkDocumentId] = React.useState<string | null>(null)
  const [releaseReason, setReleaseReason] = React.useState('')

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/warehouse')
    }
  }, [authLoading, permLoading, canAccess, router])

  if (authLoading || permLoading) return null

  const handleRelease = (id: string) => {
    setSelectedId(id)
    setBulkDocumentId(null)
    setReleaseReason('')
    setReleaseDialogOpen(true)
  }

  const handleBulkRelease = (documentId: string) => {
    setSelectedId(null)
    setBulkDocumentId(documentId)
    setReleaseReason('')
    setReleaseDialogOpen(true)
  }

  const confirmRelease = async () => {
    try {
      if (selectedId) {
        await releaseMut.mutateAsync({ id: selectedId, reason: releaseReason || undefined })
      } else if (bulkDocumentId) {
        await releaseBulkMut.mutateAsync({ documentId: bulkDocumentId, reason: releaseReason || undefined })
      }
      toast.success(t('statusReleased'))
      setReleaseDialogOpen(false)
      setSelectedId(null)
      setBulkDocumentId(null)
    } catch {
      toast.error('Error')
    }
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 25)

  // Group by documentId for bulk release actions
  const documentIds = [...new Set(items.filter(i => i.status === 'ACTIVE').map(i => i.documentId))]

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t('pageTitle')}</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1) }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder={t('filterStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('filterAllStatuses')}</SelectItem>
            <SelectItem value="ACTIVE">{t('statusActive')}</SelectItem>
            <SelectItem value="RELEASED">{t('statusReleased')}</SelectItem>
            <SelectItem value="FULFILLED">{t('statusFulfilled')}</SelectItem>
          </SelectContent>
        </Select>

        {canManage && documentIds.length > 0 && (
          <div className="flex gap-2">
            {documentIds.map((docId) => (
              <Button
                key={docId}
                variant="outline"
                size="sm"
                onClick={() => handleBulkRelease(docId)}
                disabled={releaseBulkMut.isPending}
              >
                {t('actionReleaseBulk')}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-4 text-muted-foreground text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="p-4 text-muted-foreground text-sm">{t('emptyState')}</div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="divide-y sm:hidden">
            {items.map((item) => (
              <div key={item.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.article?.name ?? '\u2014'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono text-muted-foreground">{item.article?.number ?? '\u2014'}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(item.createdAt).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-sm font-mono font-medium">{item.quantity}</span>
                    {canManage && item.status === 'ACTIVE' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRelease(item.id)}
                        disabled={releaseMut.isPending}
                      >
                        {t('actionRelease')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colArticleNumber')}</TableHead>
                  <TableHead>{t('colArticleName')}</TableHead>
                  <TableHead className="text-right">{t('colQuantity')}</TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                  <TableHead>{t('colCreatedAt')}</TableHead>
                  {canManage && <TableHead>{t('colActions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.article?.number ?? '\u2014'}</TableCell>
                    <TableCell>{item.article?.name ?? '\u2014'}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleDateString('de-DE')}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {item.status === 'ACTIVE' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRelease(item.id)}
                            disabled={releaseMut.isPending}
                          >
                            {t('actionRelease')}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center sm:justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                &laquo;
              </Button>
              <span className="text-xs sm:text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                &raquo;
              </Button>
            </div>
          )}
        </>
      )}

      {/* Release Dialog */}
      <Dialog open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialogReleaseTitle')}</DialogTitle>
            <DialogDescription>{t('dialogReleaseDescription')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">{t('dialogReleaseReasonLabel')}</label>
            <Input
              value={releaseReason}
              onChange={(e) => setReleaseReason(e.target.value)}
              placeholder={t('dialogReleaseReasonLabel')}
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmRelease}
              disabled={releaseMut.isPending || releaseBulkMut.isPending}
            >
              {t('dialogReleaseConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

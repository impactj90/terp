'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useWhArticleAvailableStock, useReleaseWhReservation } from '@/hooks'

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('warehouseReservations')
  const variants: Record<string, string> = {
    ACTIVE: 'bg-blue-100 text-blue-700 border-blue-200',
    RELEASED: 'bg-gray-100 text-gray-600 border-gray-200',
    FULFILLED: 'bg-green-100 text-green-700 border-green-200',
  }
  const labels: Record<string, string> = {
    ACTIVE: t('statusActive'),
    RELEASED: t('statusReleased'),
    FULFILLED: t('statusFulfilled'),
  }
  return (
    <Badge variant="outline" className={variants[status] ?? ''}>
      {labels[status] ?? status}
    </Badge>
  )
}

export function ArticleReservationsTab({ articleId }: { articleId: string }) {
  const t = useTranslations('warehouseReservations')
  const { data, isLoading } = useWhArticleAvailableStock(articleId)
  const releaseMut = useReleaseWhReservation()

  const [releaseDialogOpen, setReleaseDialogOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [releaseReason, setReleaseReason] = React.useState('')

  const handleRelease = (id: string) => {
    setSelectedId(id)
    setReleaseReason('')
    setReleaseDialogOpen(true)
  }

  const confirmRelease = async () => {
    if (!selectedId) return
    try {
      await releaseMut.mutateAsync({
        id: selectedId,
        reason: releaseReason || undefined,
      })
      toast.success(t('statusReleased'))
      setReleaseDialogOpen(false)
      setSelectedId(null)
    } catch {
      toast.error('Error')
    }
  }

  if (isLoading) {
    return <div className="p-4 text-muted-foreground text-sm">Loading...</div>
  }

  const reservations = data?.reservations ?? []

  if (reservations.length === 0) {
    return <div className="p-4 text-muted-foreground text-sm">{t('emptyState')}</div>
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colDocumentNumber')}</TableHead>
            <TableHead>{t('colCustomer')}</TableHead>
            <TableHead className="text-right">{t('colQuantity')}</TableHead>
            <TableHead>{t('colCreatedAt')}</TableHead>
            <TableHead>{t('colStatus')}</TableHead>
            <TableHead>{t('colActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reservations.map((res) => (
            <TableRow key={res.id}>
              <TableCell>{res.document?.number ?? '\u2014'}</TableCell>
              <TableCell>{res.document?.company ?? '\u2014'}</TableCell>
              <TableCell className="text-right">{res.quantity}</TableCell>
              <TableCell>
                {new Date(res.createdAt).toLocaleDateString('de-DE')}
              </TableCell>
              <TableCell>
                <StatusBadge status={res.status} />
              </TableCell>
              <TableCell>
                {res.status === 'ACTIVE' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRelease(res.id)}
                    disabled={releaseMut.isPending}
                  >
                    {t('actionRelease')}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
            <Button onClick={confirmRelease} disabled={releaseMut.isPending}>
              {t('dialogReleaseConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

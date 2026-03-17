'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Edit, X, RotateCcw, Link2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useCrmInquiryById,
  useCancelCrmInquiry,
  useReopenCrmInquiry,
  useDeleteCrmInquiry,
} from '@/hooks'
import { InquiryStatusBadge } from './inquiry-status-badge'
import { InquiryFormSheet } from './inquiry-form-sheet'
import { InquiryCloseDialog } from './inquiry-close-dialog'
import { InquiryLinkOrderDialog } from './inquiry-link-order-dialog'
import { CorrespondenceList } from './correspondence-list'

interface InquiryDetailProps {
  id: string
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '\u2014'}</span>
    </div>
  )
}

export function InquiryDetail({ id }: InquiryDetailProps) {
  const t = useTranslations('crmInquiries')
  const router = useRouter()

  const { data: inquiry, isLoading } = useCrmInquiryById(id)

  // Dialog state
  const [editOpen, setEditOpen] = React.useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false)
  const [reopenDialogOpen, setReopenDialogOpen] = React.useState(false)
  const [linkOrderOpen, setLinkOrderOpen] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)

  const cancelMutation = useCancelCrmInquiry()
  const reopenMutation = useReopenCrmInquiry()
  const deleteMutation = useDeleteCrmInquiry()

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ id, reason: undefined })
      setCancelDialogOpen(false)
      toast.success(t('statusCancelled'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  const handleReopen = async () => {
    try {
      await reopenMutation.mutateAsync({ id })
      setReopenDialogOpen(false)
      toast.success(t('reopen'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id })
      setDeleteDialogOpen(false)
      toast.success(t('deleteTitle'))
      router.push('/crm/inquiries')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!inquiry) {
    return <p className="text-muted-foreground">{t('noEntries')}</p>
  }

  const isClosed = inquiry.status === 'CLOSED'
  const isCancelled = inquiry.status === 'CANCELLED'
  const isTerminal = isClosed || isCancelled

  const formatDate = (dateStr: string | Date | null) => {
    if (!dateStr) return '\u2014'
    const d = new Date(dateStr as string)
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const effortLabels: Record<string, string> = {
    low: t('effortLow'),
    medium: t('effortMedium'),
    high: t('effortHigh'),
  }

  const address = inquiry.address as { id: string; company: string; tenantId: string } | null
  const contact = inquiry.contact as { id: string; firstName: string; lastName: string } | null
  const order = inquiry.order as { id: string; code: string; name: string } | null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/crm/inquiries')}
            className="mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('title')}
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{inquiry.title}</h1>
            <Badge variant="outline" className="font-mono">{inquiry.number}</Badge>
            <InquiryStatusBadge status={inquiry.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isClosed && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              {t('edit')}
            </Button>
          )}
          {!isTerminal && (
            <Button variant="outline" size="sm" onClick={() => setCloseDialogOpen(true)}>
              {t('close')}
            </Button>
          )}
          {!isTerminal && (
            <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(true)}>
              <X className="mr-2 h-4 w-4" />
              {t('cancel')}
            </Button>
          )}
          {isTerminal && (
            <Button variant="outline" size="sm" onClick={() => setReopenDialogOpen(true)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('reopen')}
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('delete')}
          </Button>
        </div>
      </div>

      {/* Immutable notice */}
      {isClosed && (
        <Alert>
          <AlertDescription>{t('immutableNotice')}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
          <TabsTrigger value="correspondence">{t('correspondence')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('basicData')}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                <DetailRow label={t('number')} value={inquiry.number} />
                <DetailRow label={t('inquiryTitle')} value={inquiry.title} />
                <DetailRow
                  label={t('address')}
                  value={address ? (
                    <a
                      href={`/crm/addresses/${address.id}`}
                      className="text-primary underline"
                      onClick={(e) => {
                        e.preventDefault()
                        router.push(`/crm/addresses/${address.id}`)
                      }}
                    >
                      {address.company}
                    </a>
                  ) : null}
                />
                <DetailRow
                  label={t('contact')}
                  value={contact ? `${contact.firstName} ${contact.lastName}` : null}
                />
                <DetailRow
                  label={t('effort')}
                  value={inquiry.effort ? (effortLabels[inquiry.effort] || inquiry.effort) : null}
                />
                <DetailRow label={t('creditRating')} value={inquiry.creditRating} />
                <DetailRow label={t('createdAt')} value={formatDate(inquiry.createdAt)} />
              </CardContent>
            </Card>

            {/* Status & Order Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('additionalInfo')}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                <DetailRow label={t('status')} value={<InquiryStatusBadge status={inquiry.status} />} />

                {/* Linked Order */}
                <div className="flex items-start justify-between py-2">
                  <span className="text-sm text-muted-foreground">{t('linkedOrder')}</span>
                  <div className="text-sm font-medium text-right">
                    {order ? (
                      <span>{order.code} — {order.name}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{t('noOrder')}</span>
                        {!isTerminal && (
                          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLinkOrderOpen(true)}>
                            <Link2 className="mr-1 h-3 w-3" />
                            {t('linkOrder')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Closing Info */}
                {inquiry.closedAt && (
                  <>
                    <DetailRow label={t('closedAt')} value={formatDate(inquiry.closedAt)} />
                    <DetailRow label={t('closingReason')} value={inquiry.closingReason} />
                    <DetailRow label={t('closingRemarks')} value={inquiry.closingRemarks} />
                  </>
                )}

                {/* Notes */}
                {inquiry.notes && (
                  <div className="py-2">
                    <span className="text-sm text-muted-foreground">{t('notes')}</span>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{inquiry.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Correspondence Tab */}
        <TabsContent value="correspondence" className="mt-6">
          {address && (
            <CorrespondenceList addressId={address.id} tenantId={address.tenantId} />
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <InquiryFormSheet
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) setEditOpen(false)
        }}
        addressId={inquiry.addressId}
        editItem={inquiry as unknown as Record<string, unknown>}
      />

      <InquiryCloseDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        inquiryId={id}
        inquiryTitle={inquiry.title}
        hasLinkedOrder={!!inquiry.orderId}
      />

      <InquiryLinkOrderDialog
        open={linkOrderOpen}
        onOpenChange={setLinkOrderOpen}
        inquiryId={id}
        inquiryTitle={inquiry.title}
      />

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title={t('cancelTitle')}
        description={t('cancelDescription', { title: inquiry.title })}
        confirmLabel={t('confirm')}
        onConfirm={handleCancel}
        variant="destructive"
      />

      <ConfirmDialog
        open={reopenDialogOpen}
        onOpenChange={setReopenDialogOpen}
        title={t('reopenTitle')}
        description={t('reopenDescription', { title: inquiry.title })}
        confirmLabel={t('confirm')}
        onConfirm={handleReopen}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('deleteTitle')}
        description={t('deleteDescription', { title: inquiry.title })}
        confirmLabel={t('confirm')}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  )
}

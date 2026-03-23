'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Lock, Pencil, CheckCircle, FileText, Briefcase, Trash2 } from 'lucide-react'
import {
  useBillingServiceCase,
  useCreateOrderFromServiceCase,
  useDeleteBillingServiceCase,
} from '@/hooks'
import { ServiceCaseStatusBadge } from './service-case-status-badge'
import { ServiceCaseFormSheet } from './service-case-form-sheet'
import { ServiceCaseCloseDialog } from './service-case-close-dialog'
import { ServiceCaseInvoiceDialog } from './service-case-invoice-dialog'
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

interface ServiceCaseDetailProps {
  id: string
}

export function ServiceCaseDetail({ id }: ServiceCaseDetailProps) {
  const router = useRouter()
  const t = useTranslations('billingServiceCases')
  const { data: sc, isLoading } = useBillingServiceCase(id)
  const createOrderMutation = useCreateOrderFromServiceCase()
  const deleteMutation = useDeleteBillingServiceCase()

  const [showEditSheet, setShowEditSheet] = React.useState(false)
  const [showCloseDialog, setShowCloseDialog] = React.useState(false)
  const [showInvoiceDialog, setShowInvoiceDialog] = React.useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)
  const [showOrderDialog, setShowOrderDialog] = React.useState(false)

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">{t('loading')}</div>
  }

  if (!sc) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">{t('notFound')}</div>
  }

  const isEditable = sc.status === 'OPEN' || sc.status === 'IN_PROGRESS'
  const isClosed = sc.status === 'CLOSED'
  const isImmutable = sc.status === 'CLOSED' || sc.status === 'INVOICED'

  const typedSc = sc as Record<string, unknown> & {
    address?: { company?: string; street?: string; zip?: string; city?: string }
    contact?: { firstName?: string; lastName?: string } | null
    assignedTo?: { firstName?: string; lastName?: string } | null
    order?: { id?: string; code?: string; name?: string } | null
    invoiceDocument?: { id?: string; number?: string; type?: string; status?: string } | null
    inquiry?: { id?: string; number?: string; title?: string } | null
  }

  const handleCreateOrder = async () => {
    try {
      await createOrderMutation.mutateAsync({
        id: sc.id,
        orderName: sc.title,
      })
      toast.success(t('orderCreated'))
      setShowOrderDialog(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('error')
      toast.error(message)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: sc.id })
      toast.success(t('serviceCaseDeleted'))
      router.push('/orders/service-cases')
    } catch (err) {
      const message = err instanceof Error ? err.message : t('deleteError')
      toast.error(message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/orders/service-cases')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t('back')}
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{sc.title}</h2>
            <span className="text-muted-foreground font-mono">{sc.number}</span>
            <ServiceCaseStatusBadge status={sc.status} />
          </div>
        </div>
      </div>

      {/* Immutable Notice */}
      {isImmutable && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            {sc.status === 'INVOICED'
              ? t('invoicedImmutable')
              : t('closedImmutable')}
          </AlertDescription>
        </Alert>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-2">
        {isEditable && (
          <>
            <Button variant="outline" size="sm" onClick={() => setShowEditSheet(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              {t('edit')}
            </Button>
            {!sc.orderId && (
              <Button variant="outline" size="sm" onClick={() => setShowOrderDialog(true)}>
                <Briefcase className="h-4 w-4 mr-1" />
                {t('createOrder')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowCloseDialog(true)}>
              <CheckCircle className="h-4 w-4 mr-1" />
              {t('close')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(true)} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-1" />
              {t('delete')}
            </Button>
          </>
        )}
        {isClosed && !sc.invoiceDocumentId && (
          <Button variant="outline" size="sm" onClick={() => setShowInvoiceDialog(true)}>
            <FileText className="h-4 w-4 mr-1" />
            {t('createInvoice')}
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Address Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('customerAddress')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              <div className="font-medium">{typedSc.address?.company ?? '-'}</div>
              {typedSc.address?.street && <div>{typedSc.address.street}</div>}
              {(typedSc.address?.zip || typedSc.address?.city) && (
                <div>{typedSc.address.zip} {typedSc.address.city}</div>
              )}
            </div>
            {typedSc.contact && (
              <div className="mt-3 pt-3 border-t">
                <span className="text-muted-foreground text-xs">{t('contactPerson')}</span>
                <div className="text-sm font-medium">
                  {typedSc.contact.firstName} {typedSc.contact.lastName}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label={t('reportedAt')} value={formatDate(sc.reportedAt)} />
            <DetailRow
              label={t('costNotified')}
              value={sc.customerNotifiedCost ? t('yes') : t('no')}
            />
            {typedSc.assignedTo && (
              <DetailRow
                label={t('assignedTo')}
                value={`${typedSc.assignedTo.firstName} ${typedSc.assignedTo.lastName}`}
              />
            )}
            {sc.closingReason && (
              <DetailRow label={t('closingReason')} value={sc.closingReason} />
            )}
            {sc.closedAt && (
              <DetailRow label={t('closedAt')} value={formatDate(sc.closedAt)} />
            )}
          </CardContent>
        </Card>

        {/* Description */}
        {sc.description && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t('description')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{sc.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Links */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('links')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {typedSc.order ? (
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{t('linkedOrder')}</span>
                <span className="text-sm font-medium">
                  {typedSc.order.code} — {typedSc.order.name}
                </span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">{t('noLinkedOrder')}</div>
            )}
            {typedSc.invoiceDocument ? (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{t('linkedInvoice')}</span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => router.push(`/orders/documents/${typedSc.invoiceDocument!.id}`)}
                >
                  {typedSc.invoiceDocument.number}
                </Button>
              </div>
            ) : null}
            {typedSc.inquiry ? (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{t('linkedInquiry')}</span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => router.push(`/crm/inquiries/${typedSc.inquiry!.id}`)}
                >
                  {typedSc.inquiry.number} — {typedSc.inquiry.title}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <ServiceCaseFormSheet
        open={showEditSheet}
        onOpenChange={setShowEditSheet}
        editItem={sc as unknown as Record<string, unknown>}
      />

      <ServiceCaseCloseDialog
        open={showCloseDialog}
        onOpenChange={setShowCloseDialog}
        serviceCaseId={sc.id}
        serviceCaseTitle={sc.title}
      />

      <ServiceCaseInvoiceDialog
        open={showInvoiceDialog}
        onOpenChange={setShowInvoiceDialog}
        serviceCaseId={sc.id}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t('deleteTitle')}
        description={t('deleteDescription', { title: sc.title })}
        onConfirm={handleDelete}
        confirmLabel={t('deleteConfirm')}
        variant="destructive"
      />

      <ConfirmDialog
        open={showOrderDialog}
        onOpenChange={setShowOrderDialog}
        title={t('createOrderTitle')}
        description={t('createOrderDescription', { title: sc.title })}
        onConfirm={handleCreateOrder}
        confirmLabel={t('createOrderConfirm')}
      />
    </div>
  )
}

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Edit, Send, XCircle, FileDown, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useWhPurchaseOrder,
  useCancelWhPurchaseOrder,
  useDownloadWhPurchaseOrderPdf,
} from '@/hooks/use-wh-purchase-orders'
import { PurchaseOrderStatusBadge } from './purchase-order-status-badge'
import { PurchaseOrderPositionTable } from './purchase-order-position-table'
import { PurchaseOrderSendDialog } from './purchase-order-send-dialog'
import { PurchaseOrderForm } from './purchase-order-form'
import { EmailComposeDialog } from '@/components/email/email-compose-dialog'
import { EmailSendLog } from '@/components/email/email-send-log'

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '\u2014'}</span>
    </div>
  )
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '\u2014'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(price)
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '\u2014'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '\u2014'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

const METHOD_KEYS: Record<string, string> = {
  PHONE: 'methodPhone',
  EMAIL: 'methodEmail',
  FAX: 'methodFax',
  PRINT: 'methodPrint',
}

interface PurchaseOrderDetailProps {
  id: string
}

export function PurchaseOrderDetail({ id }: PurchaseOrderDetailProps) {
  const t = useTranslations('warehousePurchaseOrders')
  const tc = useTranslations('common')
  const router = useRouter()

  const { data: order, isLoading } = useWhPurchaseOrder(id)
  const cancelMutation = useCancelWhPurchaseOrder()
  const downloadPdfMutation = useDownloadWhPurchaseOrderPdf()

  const [isEditing, setIsEditing] = React.useState(false)
  const [sendOpen, setSendOpen] = React.useState(false)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [emailOpen, setEmailOpen] = React.useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('purchaseOrderNotFound')}
      </div>
    )
  }

  const isDraft = order.status === 'DRAFT'
  const canCancel = order.status === 'DRAFT' || order.status === 'ORDERED'

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ id: order.id })
      toast.success(t('toastCancelled'))
      setCancelOpen(false)
    } catch {
      toast.error('Error')
    }
  }

  // Edit mode: show the form
  if (isEditing && isDraft) {
    return (
      <PurchaseOrderForm
        purchaseOrder={{
          id: order.id,
          number: order.number,
          supplierId: order.supplierId,
          contactId: order.contactId,
          requestedDelivery: order.requestedDelivery,
          confirmedDelivery: order.confirmedDelivery,
          notes: order.notes,
          status: order.status,
        }}
        onSuccess={() => setIsEditing(false)}
      />
    )
  }

  const supplier = order.supplier as {
    id: string
    company?: string | null
    number?: string | null
    ourCustomerNumber?: string | null
  } | null
  const contact = order.contact as {
    id: string
    firstName?: string | null
    lastName?: string | null
  } | null

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-3 sm:gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 mt-0.5"
                onClick={() => router.push('/warehouse/purchase-orders')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tc('goBack')}</TooltipContent>
          </Tooltip>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold">
              {t('detailTitle', { number: order.number })}
            </h1>
            <div className="mt-1">
              <PurchaseOrderStatusBadge
                status={
                  order.status as
                    | 'DRAFT'
                    | 'ORDERED'
                    | 'PARTIALLY_RECEIVED'
                    | 'RECEIVED'
                    | 'CANCELLED'
                }
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {isDraft && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('actionEdit')}</span>
              </Button>
              <Button size="sm" onClick={() => setSendOpen(true)}>
                <Send className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('actionSendOrder')}</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
                <Mail className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">E-Mail</span>
              </Button>
            </>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('actionCancel')}</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={downloadPdfMutation.isPending}
            onClick={async () => {
              try {
                const result = await downloadPdfMutation.mutateAsync({ id: order.id })
                if (result?.signedUrl) {
                  window.open(result.signedUrl, '_blank')
                }
              } catch {
                toast.error(t('pdfDownloadFailed'))
              }
            }}
          >
            {downloadPdfMutation.isPending ? (
              <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">
              {downloadPdfMutation.isPending ? t('loadingPdf') : t('actionGeneratePdf')}
            </span>
          </Button>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold mb-3">
              {t('sectionDetails')}
            </h3>
            <DetailRow
              label={t('detailSupplier')}
              value={
                supplier
                  ? `${supplier.number ? supplier.number + ' — ' : ''}${supplier.company || ''}`
                  : undefined
              }
            />
            {supplier?.ourCustomerNumber && (
              <DetailRow
                label={t('detailOurCustomerNumber')}
                value={supplier.ourCustomerNumber}
              />
            )}
            <DetailRow
              label={t('detailContact')}
              value={
                contact
                  ? [contact.firstName, contact.lastName]
                      .filter(Boolean)
                      .join(' ')
                  : undefined
              }
            />
            <DetailRow
              label={t('detailOrderDate')}
              value={formatDate(order.orderDate)}
            />
            <DetailRow
              label={t('detailRequestedDelivery')}
              value={formatDate(order.requestedDelivery)}
            />
            <DetailRow
              label={t('detailConfirmedDelivery')}
              value={formatDate(order.confirmedDelivery)}
            />
            {order.orderMethod && (
              <DetailRow
                label={t('detailOrderMethod')}
                value={t((METHOD_KEYS[order.orderMethod] ?? order.orderMethod) as Parameters<typeof t>[0])}
              />
            )}
            {order.orderMethodNote && (
              <DetailRow
                label={t('detailOrderMethodNote')}
                value={order.orderMethodNote}
              />
            )}
            <DetailRow
              label={t('detailCreatedAt')}
              value={formatDateTime(order.createdAt)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold mb-3">
              {t('sectionSummary')}
            </h3>
            <DetailRow
              label={t('detailSubtotal')}
              value={formatPrice(order.subtotalNet)}
            />
            {(() => {
              const vatGroups = new Map<number, number>()
              const positions = (order as Record<string, unknown>).positions as Array<{
                totalPrice?: number | null
                vatRate?: number | null
              }> | undefined
              for (const pos of positions ?? []) {
                if (pos.totalPrice != null && pos.vatRate != null && pos.vatRate > 0) {
                  const amount = pos.totalPrice * (pos.vatRate / 100)
                  vatGroups.set(pos.vatRate, (vatGroups.get(pos.vatRate) ?? 0) + amount)
                }
              }
              return Array.from(vatGroups.entries())
                .sort(([a], [b]) => a - b)
                .map(([rate, amount]) => (
                  <DetailRow
                    key={rate}
                    label={t('detailVatRate', { rate: String(rate) })}
                    value={formatPrice(Math.round(amount * 100) / 100)}
                  />
                ))
            })()}
            <DetailRow
              label={t('detailTotal')}
              value={
                <span className="text-base font-bold">
                  {formatPrice(order.totalGross)}
                </span>
              }
            />
            {order.notes && (
              <>
                <h3 className="text-sm font-semibold mt-4 mb-2">
                  {t('detailNotes')}
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {order.notes}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Positions */}
      <Card>
        <CardContent className="pt-6">
          <PurchaseOrderPositionTable
            purchaseOrderId={order.id}
            supplierId={order.supplierId}
            isDraft={isDraft}
          />
        </CardContent>
      </Card>

      {/* Send Dialog */}
      <PurchaseOrderSendDialog
        purchaseOrderId={order.id}
        orderNumber={order.number}
        open={sendOpen}
        onOpenChange={setSendOpen}
      />

      {/* Cancel Dialog */}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={(open) => !open && setCancelOpen(false)}
        title={t('cancelDialogTitle')}
        description={t('cancelDialogDescription', { number: order.number })}
        confirmLabel={t('cancelDialogConfirm')}
        variant="destructive"
        isLoading={cancelMutation.isPending}
        onConfirm={handleCancel}
      />

      {/* Email Compose Dialog */}
      <EmailComposeDialog
        documentId={order.id}
        documentType="PURCHASE_ORDER"
        documentNumber={order.number}
        open={emailOpen}
        onOpenChange={setEmailOpen}
      />

      <EmailSendLog documentId={order.id} />
    </div>
  )
}

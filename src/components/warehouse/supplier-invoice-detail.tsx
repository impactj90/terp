'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Edit, XCircle, CreditCard } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SupplierInvoiceStatusBadge } from './supplier-invoice-status-badge'
import { SupplierInvoiceFormSheet } from './supplier-invoice-form-sheet'
import { SupplierPaymentFormDialog } from './supplier-payment-form-dialog'
import {
  useWhSupplierInvoice,
  useCancelWhSupplierInvoice,
  useCancelWhSupplierPayment,
} from '@/hooks/use-wh-supplier-invoices'
import { toast } from 'sonner'

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return '\u2014'
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

interface SupplierInvoiceDetailProps {
  id: string
}

export function SupplierInvoiceDetail({ id }: SupplierInvoiceDetailProps) {
  const t = useTranslations('warehouseSupplierInvoices')
  const router = useRouter()

  const { data: invoice, isLoading } = useWhSupplierInvoice(id)
  const cancelMutation = useCancelWhSupplierInvoice()
  const cancelPaymentMutation = useCancelWhSupplierPayment()

  const [showEditSheet, setShowEditSheet] = React.useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = React.useState(false)
  const [showCancelDialog, setShowCancelDialog] = React.useState(false)
  const [cancelPaymentId, setCancelPaymentId] = React.useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noInvoicesFound')}
      </div>
    )
  }

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ id })
      toast.success(t('toastCancelled'))
      setShowCancelDialog(false)
    } catch {
      toast.error('Error')
    }
  }

  const handleCancelPayment = async () => {
    if (!cancelPaymentId) return
    try {
      await cancelPaymentMutation.mutateAsync({ id: cancelPaymentId })
      toast.success(t('toastPaymentCancelled'))
      setCancelPaymentId(null)
    } catch {
      toast.error('Error')
    }
  }

  const canEdit = invoice.status === 'OPEN'
  const canPay = invoice.status === 'OPEN' || invoice.status === 'PARTIAL'
  const canCancelInvoice = invoice.status !== 'CANCELLED'

  // Compute discount info for payment dialog
  let discountInfo: string | null = null
  if (invoice.discountPercent && invoice.discountDays) {
    discountInfo = `${invoice.discountPercent}% / ${invoice.discountDays} Tage`
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => router.push('/warehouse/supplier-invoices')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold truncate">
              {t('detailTitle')}: {invoice.number}
            </h1>
            <div className="mt-1">
              <SupplierInvoiceStatusBadge status={invoice.status as 'OPEN' | 'PARTIAL' | 'PAID' | 'CANCELLED'} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setShowEditSheet(true)}>
              <Edit className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('actionEdit')}</span>
            </Button>
          )}
          {canPay && (
            <Button size="sm" onClick={() => setShowPaymentDialog(true)}>
              <CreditCard className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('actionRecordPayment')}</span>
            </Button>
          )}
          {canCancelInvoice && (
            <Button variant="destructive" size="sm" onClick={() => setShowCancelDialog(true)}>
              <XCircle className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('actionCancel')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Invoice Info */}
        <Card>
          <CardHeader>
            <CardTitle>{t('detailInvoiceInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('fieldNumber')}</span>
              <span className="font-mono">{invoice.number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('fieldSupplier')}</span>
              <span>{(invoice.supplier as { company: string })?.company ?? '\u2014'}</span>
            </div>
            {invoice.purchaseOrder && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('fieldPurchaseOrder')}</span>
                <span className="font-mono">{(invoice.purchaseOrder as { number: string }).number}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('fieldInvoiceDate')}</span>
              <span>{formatDate(invoice.invoiceDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('fieldReceivedDate')}</span>
              <span>{formatDate(invoice.receivedDate)}</span>
            </div>
            {invoice.notes && (
              <div>
                <span className="text-muted-foreground">{t('fieldNotes')}</span>
                <p className="mt-1 text-sm">{invoice.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t('detailSummary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('fieldTotalNet')}</span>
              <span>{formatPrice(invoice.totalNet)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('fieldTotalVat')}</span>
              <span>{formatPrice(invoice.totalVat)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{t('fieldTotalGross')}</span>
              <span>{formatPrice(invoice.totalGross)}</span>
            </div>
            <hr />
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('detailPaidAmount')}</span>
              <span className="text-green-700">{formatPrice(invoice.paidAmount)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{t('detailOpenAmount')}</span>
              <span className={invoice.isOverdue ? 'text-destructive' : ''}>
                {formatPrice(invoice.openAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('colDueDate')}</span>
              <span className={invoice.isOverdue ? 'text-destructive font-medium' : ''}>
                {formatDate(invoice.dueDate)}
                {invoice.isOverdue && (
                  <Badge variant="destructive" className="ml-2 text-xs">{t('detailOverdue')}</Badge>
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Terms */}
      {(invoice.paymentTermDays || invoice.discountPercent || invoice.discountPercent2) && (
        <Card>
          <CardHeader>
            <CardTitle>{t('detailPaymentTerms')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invoice.paymentTermDays && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('fieldPaymentTermDays')}</span>
                <span>{invoice.paymentTermDays}</span>
              </div>
            )}
            {invoice.discountPercent && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('fieldDiscountPercent')}</span>
                <span>{invoice.discountPercent}% / {invoice.discountDays ?? 0} Tage</span>
              </div>
            )}
            {invoice.discountPercent2 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('fieldDiscountPercent2')}</span>
                <span>{invoice.discountPercent2}% / {invoice.discountDays2 ?? 0} Tage</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('detailPayments')}</CardTitle>
        </CardHeader>
        <CardContent>
          {(invoice.payments as Array<{
            id: string
            date: string | Date
            amount: number
            type: string
            isDiscount: boolean
            status: string
            notes: string | null
          }>)?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('paymentFieldDate')}</TableHead>
                  <TableHead className="text-right">{t('paymentFieldAmount')}</TableHead>
                  <TableHead>{t('paymentFieldType')}</TableHead>
                  <TableHead>{t('paymentFieldDiscount')}</TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                  <TableHead>{t('paymentFieldNotes')}</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invoice.payments as Array<{
                  id: string
                  date: string | Date
                  amount: number
                  type: string
                  isDiscount: boolean
                  status: string
                  notes: string | null
                }>).map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.date)}</TableCell>
                    <TableCell className="text-right">{formatPrice(payment.amount)}</TableCell>
                    <TableCell>
                      {payment.type === 'BANK' ? t('paymentTypeBank') : t('paymentTypeCash')}
                    </TableCell>
                    <TableCell>
                      {payment.isDiscount && (
                        <Badge variant="secondary">{t('paymentFieldDiscount')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={payment.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {payment.status === 'ACTIVE' ? t('paymentStatusActive') : t('paymentStatusCancelled')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {payment.notes || '\u2014'}
                    </TableCell>
                    <TableCell>
                      {payment.status === 'ACTIVE' && !payment.isDiscount && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setCancelPaymentId(payment.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              {t('noInvoicesFound')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ConfirmDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title={t('cancelConfirmTitle')}
        description={t('cancelConfirmMessage')}
        onConfirm={handleCancel}
        isLoading={cancelMutation.isPending}
      />

      <ConfirmDialog
        open={!!cancelPaymentId}
        onOpenChange={(open) => { if (!open) setCancelPaymentId(null) }}
        title={t('cancelPaymentConfirmTitle')}
        description={t('cancelPaymentConfirmMessage')}
        onConfirm={handleCancelPayment}
        isLoading={cancelPaymentMutation.isPending}
      />

      <SupplierInvoiceFormSheet
        open={showEditSheet}
        onOpenChange={setShowEditSheet}
        invoice={invoice as unknown as Record<string, unknown>}
      />

      <SupplierPaymentFormDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        invoiceId={id}
        openAmount={invoice.openAmount ?? 0}
        discountInfo={discountInfo}
      />
    </div>
  )
}

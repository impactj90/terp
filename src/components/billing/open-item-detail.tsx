'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Plus, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useBillingOpenItem } from '@/hooks'
import { PaymentStatusBadge } from './payment-status-badge'
import { PaymentFormDialog } from './payment-form-dialog'
import { PaymentCancelDialog } from './payment-cancel-dialog'
import { getApplicableDiscount } from '@/lib/services/billing-payment-service'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

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

interface OpenItemDetailProps {
  documentId: string
}

export function OpenItemDetail({ documentId }: OpenItemDetailProps) {
  const router = useRouter()
  const t = useTranslations('billingOpenItems')
  const { data: doc, isLoading } = useBillingOpenItem(documentId)
  const [showPaymentForm, setShowPaymentForm] = React.useState(false)
  const [cancelPaymentId, setCancelPaymentId] = React.useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse bg-muted rounded" />
        <div className="h-64 animate-pulse bg-muted rounded" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/orders/open-items')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t('back')}
        </Button>
        <p className="text-muted-foreground">{t('invoiceNotFound')}</p>
      </div>
    )
  }

  const typedDoc = doc as unknown as {
    id: string
    number: string
    documentDate: Date
    totalGross: number
    paymentTermDays: number | null
    discountPercent: number | null
    discountDays: number | null
    discountPercent2: number | null
    discountDays2: number | null
    paidAmount: number
    openAmount: number
    effectiveTotalGross: number
    creditNoteReduction: number
    paymentStatus: string
    dueDate: Date | null
    isOverdue: boolean
    address: { id: string; company: string } | null
    contact: { id: string; firstName: string; lastName: string } | null
    payments: Array<{
      id: string
      date: Date
      amount: number
      type: string
      status: string
      isDiscount: boolean
      notes: string | null
    }>
  }

  // Calculate discount info for the payment form
  const discountResult = getApplicableDiscount(
    {
      documentDate: typedDoc.documentDate,
      discountDays: typedDoc.discountDays,
      discountPercent: typedDoc.discountPercent,
      discountDays2: typedDoc.discountDays2,
      discountPercent2: typedDoc.discountPercent2,
    },
    new Date()
  )

  const discountInfo = discountResult
    ? {
        tier: discountResult.tier,
        percent: discountResult.percent,
        daysRemaining: Math.max(
          0,
          Math.floor(
            ((discountResult.tier === 1
              ? typedDoc.discountDays!
              : typedDoc.discountDays2!) *
              24 * 60 * 60 * 1000 +
              new Date(typedDoc.documentDate).getTime() -
              new Date().getTime()) /
              (1000 * 60 * 60 * 24)
          )
        ),
      }
    : null

  const isPaid = typedDoc.paymentStatus === 'PAID' || typedDoc.paymentStatus === 'OVERPAID'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/orders/open-items')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('back')}
          </Button>
          <h2 className="text-2xl font-bold">{t('invoiceTitle', { number: typedDoc.number })}</h2>
          <PaymentStatusBadge status={typedDoc.paymentStatus} isOverdue={typedDoc.isOverdue} />
        </div>
        {!isPaid && (
          <Button onClick={() => setShowPaymentForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('recordPayment')}
          </Button>
        )}
      </div>

      {/* Invoice Summary */}
      <Card>
        <CardHeader>
          <CardTitle>{t('invoiceSummary')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <DetailRow label={t('customer')} value={typedDoc.address?.company ?? '-'} />
          <DetailRow label={t('invoiceDate')} value={formatDate(typedDoc.documentDate)} />
          <DetailRow label={t('dueDate')} value={formatDate(typedDoc.dueDate)} />
          <DetailRow label={t('gross')} value={formatCurrency(typedDoc.totalGross)} />
          {typedDoc.creditNoteReduction > 0 && (
            <DetailRow
              label={t('creditNotes')}
              value={`-${formatCurrency(typedDoc.creditNoteReduction)}`}
            />
          )}
          {typedDoc.creditNoteReduction > 0 && (
            <DetailRow
              label={t('effectiveAmount')}
              value={formatCurrency(typedDoc.effectiveTotalGross)}
            />
          )}
          <DetailRow label={t('paid')} value={formatCurrency(typedDoc.paidAmount)} />
          <DetailRow
            label={t('open')}
            value={
              <span className={typedDoc.openAmount > 0 ? 'text-red-600' : 'text-green-600'}>
                {formatCurrency(typedDoc.openAmount)}
              </span>
            }
          />
          {typedDoc.discountDays != null && typedDoc.discountPercent != null && (
            <DetailRow
              label={t('discount1')}
              value={t('discountWithinDays', { percent: typedDoc.discountPercent, days: typedDoc.discountDays })}
            />
          )}
          {typedDoc.discountDays2 != null && typedDoc.discountPercent2 != null && (
            <DetailRow
              label={t('discount2')}
              value={t('discountWithinDays', { percent: typedDoc.discountPercent2, days: typedDoc.discountDays2 })}
            />
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('paymentHistory')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columnDate')}</TableHead>
                <TableHead className="text-right">{t('columnAmount')}</TableHead>
                <TableHead>{t('columnPaymentType')}</TableHead>
                <TableHead>{t('columnDiscount')}</TableHead>
                <TableHead>{t('columnPaymentStatus')}</TableHead>
                <TableHead>{t('columnNotes')}</TableHead>
                <TableHead>{t('columnActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!typedDoc.payments?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t('noPayments')}
                  </TableCell>
                </TableRow>
              ) : (
                typedDoc.payments.map((payment) => (
                  <TableRow
                    key={payment.id}
                    className={payment.status === 'CANCELLED' ? 'opacity-50' : ''}
                  >
                    <TableCell>{formatDate(payment.date)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                    <TableCell>{payment.type === 'CASH' ? t('typeCash') : t('typeTransfer')}</TableCell>
                    <TableCell>{payment.isDiscount ? t('yes') : '\u2014'}</TableCell>
                    <TableCell>
                      {payment.status === 'ACTIVE' ? (
                        <span className="text-green-700">{t('statusActive')}</span>
                      ) : (
                        <span className="text-red-700">{t('statusCancelled')}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {payment.notes ?? '-'}
                    </TableCell>
                    <TableCell>
                      {payment.status === 'ACTIVE' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setCancelPaymentId(payment.id)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          {t('cancelPayment')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment Form Dialog */}
      <PaymentFormDialog
        open={showPaymentForm}
        onOpenChange={setShowPaymentForm}
        documentId={documentId}
        openAmount={typedDoc.openAmount}
        discountInfo={discountInfo}
      />

      {/* Payment Cancel Dialog */}
      {cancelPaymentId && (
        <PaymentCancelDialog
          open={!!cancelPaymentId}
          onOpenChange={(open) => { if (!open) setCancelPaymentId(null) }}
          paymentId={cancelPaymentId}
        />
      )}
    </div>
  )
}

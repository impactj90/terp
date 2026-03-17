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
          Zurück
        </Button>
        <p className="text-muted-foreground">Rechnung nicht gefunden</p>
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
            Zurück
          </Button>
          <h2 className="text-2xl font-bold">Rechnung {typedDoc.number}</h2>
          <PaymentStatusBadge status={typedDoc.paymentStatus} isOverdue={typedDoc.isOverdue} />
        </div>
        {!isPaid && (
          <Button onClick={() => setShowPaymentForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Zahlung erfassen
          </Button>
        )}
      </div>

      {/* Invoice Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Rechnungszusammenfassung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <DetailRow label="Kunde" value={typedDoc.address?.company ?? '-'} />
          <DetailRow label="Rechnungsdatum" value={formatDate(typedDoc.documentDate)} />
          <DetailRow label="Fällig am" value={formatDate(typedDoc.dueDate)} />
          <DetailRow label="Brutto" value={formatCurrency(typedDoc.totalGross)} />
          {typedDoc.creditNoteReduction > 0 && (
            <DetailRow
              label="Gutschriften"
              value={`-${formatCurrency(typedDoc.creditNoteReduction)}`}
            />
          )}
          {typedDoc.creditNoteReduction > 0 && (
            <DetailRow
              label="Effektiver Betrag"
              value={formatCurrency(typedDoc.effectiveTotalGross)}
            />
          )}
          <DetailRow label="Bezahlt" value={formatCurrency(typedDoc.paidAmount)} />
          <DetailRow
            label="Offen"
            value={
              <span className={typedDoc.openAmount > 0 ? 'text-red-600' : 'text-green-600'}>
                {formatCurrency(typedDoc.openAmount)}
              </span>
            }
          />
          {typedDoc.discountDays != null && typedDoc.discountPercent != null && (
            <DetailRow
              label="Skonto 1"
              value={`${typedDoc.discountPercent}% innerhalb von ${typedDoc.discountDays} Tagen`}
            />
          )}
          {typedDoc.discountDays2 != null && typedDoc.discountPercent2 != null && (
            <DetailRow
              label="Skonto 2"
              value={`${typedDoc.discountPercent2}% innerhalb von ${typedDoc.discountDays2} Tagen`}
            />
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>Zahlungshistorie</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                <TableHead>Art</TableHead>
                <TableHead>Skonto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notizen</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!typedDoc.payments?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Keine Zahlungen vorhanden
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
                    <TableCell>{payment.type === 'CASH' ? 'Bar' : 'Überweisung'}</TableCell>
                    <TableCell>{payment.isDiscount ? 'Ja' : '\u2014'}</TableCell>
                    <TableCell>
                      {payment.status === 'ACTIVE' ? (
                        <span className="text-green-700">Aktiv</span>
                      ) : (
                        <span className="text-red-700">Storniert</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {payment.notes ?? '-'}
                    </TableCell>
                    <TableCell>
                      {payment.status === 'ACTIVE' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setCancelPaymentId(payment.id)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Stornieren
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

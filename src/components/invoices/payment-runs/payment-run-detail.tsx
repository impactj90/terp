'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Download, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PaymentRunStatusBadge } from './payment-run-status-badge'
import {
  usePaymentRun,
  useDownloadPaymentRunXml,
  useMarkPaymentRunBooked,
  useCancelPaymentRun,
} from '@/hooks/usePaymentRuns'
import { useHasPermission } from '@/hooks'

const formatDate = (d: string | Date | null | undefined) => {
  if (!d) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(d))
}

const formatCents = (cents: number | null | undefined) => {
  if (cents == null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function maskIban(iban: string | null | undefined): string {
  if (!iban) return '—'
  const clean = iban.replace(/\s+/g, '')
  if (clean.length < 8) return clean
  return `${clean.slice(0, 4)} **** **** ${clean.slice(-4)}`
}

interface Props {
  id: string
}

export function PaymentRunDetail({ id }: Props) {
  const t = useTranslations('paymentRuns.detail')
  const tConfirm = useTranslations('paymentRuns.detail.confirm')
  const tActions = useTranslations('paymentRuns.detail.actions')
  const tCommon = useTranslations('paymentRuns')

  const { data: run, isLoading } = usePaymentRun(id)
  const downloadMutation = useDownloadPaymentRunXml()
  const bookMutation = useMarkPaymentRunBooked()
  const cancelMutation = useCancelPaymentRun()

  const { allowed: canExport } = useHasPermission(['payment_runs.export'])
  const { allowed: canBook } = useHasPermission(['payment_runs.book'])
  const { allowed: canCancel } = useHasPermission(['payment_runs.cancel'])

  const [confirmBook, setConfirmBook] = React.useState(false)
  const [confirmCancel, setConfirmCancel] = React.useState(false)

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />
  }
  if (!run) {
    return (
      <p className="text-sm text-muted-foreground">{tCommon('common.error')}</p>
    )
  }

  const canDownload = canExport && run.status !== 'CANCELLED'
  const canMarkBooked = canBook && run.status === 'EXPORTED'
  const canCancelRun =
    canCancel && (run.status === 'DRAFT' || run.status === 'EXPORTED')

  const handleDownload = async () => {
    try {
      const result = await downloadMutation.mutateAsync({ id })
      window.open(result.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleMarkBooked = async () => {
    try {
      await bookMutation.mutateAsync({ id })
      toast.success(tActions('markBooked'))
      setConfirmBook(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ id })
      toast.success(tActions('cancel'))
      setConfirmCancel(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold font-mono">{run.number}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(run.createdAt)} · {run.itemCount}{' '}
            {run.itemCount === 1 ? 'Rechnung' : 'Rechnungen'}
          </p>
        </div>
        <PaymentRunStatusBadge status={run.status} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {canDownload && (
          <Button
            onClick={handleDownload}
            disabled={downloadMutation.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            {run.xmlStoragePath
              ? tActions('downloadAgain')
              : tActions('download')}
          </Button>
        )}
        {canMarkBooked && (
          <Button variant="default" onClick={() => setConfirmBook(true)}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {tActions('markBooked')}
          </Button>
        )}
        {canCancelRun && (
          <Button variant="outline" onClick={() => setConfirmCancel(true)}>
            <XCircle className="mr-2 h-4 w-4" />
            {tActions('cancel')}
          </Button>
        )}
      </div>

      {/* Debtor card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('debtorTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>{run.debtorName}</div>
          <div className="font-mono">{maskIban(run.debtorIban)}</div>
          {run.debtorBic && (
            <div className="font-mono text-xs text-muted-foreground">
              BIC: {run.debtorBic}
            </div>
          )}
          <div className="pt-2 text-muted-foreground">
            Ausführungsdatum: {formatDate(run.executionDate)} · Summe{' '}
            <span className="font-mono">
              {formatCents(run.totalAmountCents)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Items table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('itemsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rechnung</TableHead>
                <TableHead>Empfänger</TableHead>
                <TableHead>IBAN</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                <TableHead>IBAN-Quelle</TableHead>
                <TableHead>Adress-Quelle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">
                    {item.inboundInvoice?.invoiceNumber ??
                      item.inboundInvoice?.number ??
                      item.endToEndId}
                  </TableCell>
                  <TableCell>{item.effectiveCreditorName}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {maskIban(item.effectiveIban)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCents(item.effectiveAmountCents)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.ibanSource}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.addressSource}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmBook}
        onOpenChange={setConfirmBook}
        title={tConfirm('bookTitle')}
        description={tConfirm('bookText')}
        onConfirm={handleMarkBooked}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={tConfirm('cancelTitle')}
        description={tConfirm('cancelText')}
        variant="destructive"
        onConfirm={handleCancel}
        isLoading={cancelMutation.isPending}
      />
    </div>
  )
}

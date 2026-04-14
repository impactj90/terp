'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateInboundInvoicePayment } from '@/hooks'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceId: string
  openAmount: number
}

export function InboundInvoicePaymentFormDialog({
  open,
  onOpenChange,
  invoiceId,
  openAmount,
}: Props) {
  const t = useTranslations('inboundInvoices')
  const createPayment = useCreateInboundInvoicePayment()
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = React.useState(openAmount.toFixed(2))
  const [type, setType] = React.useState<'CASH' | 'BANK'>('BANK')
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().slice(0, 10))
      setAmount(openAmount.toFixed(2))
      setType('BANK')
      setNotes('')
    }
  }, [open, openAmount])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createPayment.mutateAsync({
        invoiceId,
        date: new Date(date),
        amount: parseFloat(amount),
        type,
        notes: notes || undefined,
      })
      toast.success(t('payments.toastCreated'))
      onOpenChange(false)
    } catch (err) {
      toast.error(
        (err as Error).message || t('payments.toastCreateFailed')
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('payments.recordPayment')}</DialogTitle>
          <DialogDescription>
            {t('payments.openAmount')}: {formatCurrency(openAmount)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="iip-date">{t('payments.date')}</Label>
            <Input
              id="iip-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="iip-amount">{t('payments.amount')}</Label>
            <Input
              id="iip-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="iip-type">{t('payments.type')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'CASH' | 'BANK')}>
              <SelectTrigger id="iip-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK">{t('payments.typeBank')}</SelectItem>
                <SelectItem value="CASH">{t('payments.typeCash')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="iip-notes">{t('payments.notes')}</Label>
            <Textarea
              id="iip-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('payments.notesPlaceholder')}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('payments.cancel')}
            </Button>
            <Button type="submit" disabled={createPayment.isPending}>
              {createPayment.isPending
                ? t('payments.submitting')
                : t('payments.recordPayment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

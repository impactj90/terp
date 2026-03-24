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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useCreateWhSupplierPayment } from '@/hooks/use-wh-supplier-invoices'

interface SupplierPaymentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceId: string
  openAmount: number
  discountInfo?: string | null
}

export function SupplierPaymentFormDialog({
  open,
  onOpenChange,
  invoiceId,
  openAmount,
  discountInfo,
}: SupplierPaymentFormDialogProps) {
  const t = useTranslations('warehouseSupplierInvoices')
  const todayStr = () => new Date().toISOString().split('T')[0] ?? ''
  const [date, setDate] = React.useState(todayStr())
  const [amount, setAmount] = React.useState('')
  const [type, setType] = React.useState<'CASH' | 'BANK'>('BANK')
  const [isDiscount, setIsDiscount] = React.useState(false)
  const [notes, setNotes] = React.useState('')

  const createMutation = useCreateWhSupplierPayment()

  // Pre-fill amount with open amount
  React.useEffect(() => {
    if (open) {
      setAmount(openAmount > 0 ? openAmount.toFixed(2) : '')
      setDate(todayStr())
      setType('BANK')
      setIsDiscount(false)
      setNotes('')
    }
  }, [open, openAmount])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const amountNum = parseFloat(amount)
    if (!amountNum || amountNum <= 0) return

    try {
      await createMutation.mutateAsync({
        invoiceId,
        date,
        amount: amountNum,
        type,
        ...(isDiscount ? { isDiscount: true } : {}),
        ...(notes ? { notes } : {}),
      })
      toast.success(t('toastPaymentCreated'))
      onOpenChange(false)
    } catch {
      toast.error('Error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('paymentFormTitle')}</DialogTitle>
            <DialogDescription />
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Payment Date */}
            <div className="grid gap-2">
              <Label>{t('paymentFieldDate')}</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {/* Amount */}
            <div className="grid gap-2">
              <Label>{t('paymentFieldAmount')}</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Payment Type */}
            <div className="grid gap-2">
              <Label>{t('paymentFieldType')}</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'CASH' | 'BANK')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK">{t('paymentTypeBank')}</SelectItem>
                  <SelectItem value="CASH">{t('paymentTypeCash')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Discount info */}
            {discountInfo && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDiscount"
                  checked={isDiscount}
                  onChange={(e) => setIsDiscount(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="isDiscount" className="text-sm">
                  {t('paymentFieldDiscount')}: {discountInfo}
                </Label>
              </div>
            )}

            {/* Notes */}
            <div className="grid gap-2">
              <Label>{t('paymentFieldNotes')}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

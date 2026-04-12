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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateBillingPayment } from '@/hooks'
import { toast } from 'sonner'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

interface DiscountInfo {
  tier: number
  percent: number
  daysRemaining: number
}

interface PaymentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  openAmount: number
  discountInfo?: DiscountInfo | null
}

export function PaymentFormDialog({
  open,
  onOpenChange,
  documentId,
  openAmount,
  discountInfo,
}: PaymentFormDialogProps) {
  const createPayment = useCreateBillingPayment()
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = React.useState(openAmount.toFixed(2))
  const [type, setType] = React.useState<'CASH' | 'BANK'>('BANK')
  const [isDiscount, setIsDiscount] = React.useState(false)
  const [notes, setNotes] = React.useState('')

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().slice(0, 10))
      setAmount(openAmount.toFixed(2))
      setType('BANK')
      setIsDiscount(false)
      setNotes('')
    }
  }, [open, openAmount])

  // Calculate discount amount
  const discountAmount = isDiscount && discountInfo
    ? Math.round(openAmount * (discountInfo.percent / 100) * 100) / 100
    : 0
  const paymentAfterDiscount = isDiscount && discountInfo
    ? Math.round((openAmount - discountAmount) * 100) / 100
    : null

  // Update amount when discount is toggled
  React.useEffect(() => {
    if (isDiscount && paymentAfterDiscount !== null) {
      setAmount(paymentAfterDiscount.toFixed(2))
    } else {
      setAmount(openAmount.toFixed(2))
    }
  }, [isDiscount, paymentAfterDiscount, openAmount])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createPayment.mutateAsync({
        documentId,
        date: new Date(date),
        amount: parseFloat(amount),
        type,
        isDiscount,
        notes: notes || undefined,
      })
      toast.success('Zahlung erfasst')
      onOpenChange(false)
    } catch (err) {
      toast.error(
        (err as Error).message || 'Fehler beim Erfassen der Zahlung'
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Zahlung erfassen</DialogTitle>
          <DialogDescription>
            Offener Betrag: {formatCurrency(openAmount)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-date">Datum</Label>
            <Input
              id="payment-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-amount">Betrag</Label>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-type">Zahlungsart</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'CASH' | 'BANK')}>
              <SelectTrigger id="payment-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK">Überweisung</SelectItem>
                <SelectItem value="CASH">Bar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {discountInfo && (
            <div className="flex items-start space-x-2">
              <Checkbox
                id="payment-discount"
                checked={isDiscount}
                onCheckedChange={(checked) => setIsDiscount(checked === true)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor="payment-discount"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Skonto
                </Label>
                <p className="text-xs text-muted-foreground">
                  Skonto {discountInfo.tier} ({discountInfo.percent}%): Abzug{' '}
                  {formatCurrency(discountAmount)}
                  {' — '}noch {discountInfo.daysRemaining} Tage
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="payment-notes">Notizen</Label>
            <Textarea
              id="payment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={createPayment.isPending}>
              {createPayment.isPending ? 'Wird erfasst...' : 'Zahlung erfassen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

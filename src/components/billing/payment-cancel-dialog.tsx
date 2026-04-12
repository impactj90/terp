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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useCancelBillingPayment } from '@/hooks'
import { toast } from 'sonner'

interface PaymentCancelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentId: string
}

export function PaymentCancelDialog({
  open,
  onOpenChange,
  paymentId,
}: PaymentCancelDialogProps) {
  const cancelPayment = useCancelBillingPayment()
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (open) setReason('')
  }, [open])

  async function handleConfirm() {
    try {
      await cancelPayment.mutateAsync({
        id: paymentId,
        reason: reason || undefined,
      })
      toast.success('Zahlung storniert')
      onOpenChange(false)
    } catch (err) {
      toast.error(
        (err as Error).message || 'Fehler beim Stornieren der Zahlung'
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Zahlung stornieren</DialogTitle>
          <DialogDescription>
            Möchten Sie diese Zahlung wirklich stornieren? Der Betrag wird dem offenen Posten wieder zugerechnet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Grund (optional)</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Grund für die Stornierung"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={cancelPayment.isPending}
          >
            {cancelPayment.isPending ? 'Wird storniert...' : 'Bestätigen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

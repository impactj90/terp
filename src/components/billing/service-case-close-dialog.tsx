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
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { useCloseBillingServiceCase } from '@/hooks'
import { toast } from 'sonner'

interface ServiceCaseCloseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceCaseId: string
  serviceCaseTitle: string
}

export function ServiceCaseCloseDialog({
  open,
  onOpenChange,
  serviceCaseId,
  serviceCaseTitle,
}: ServiceCaseCloseDialogProps) {
  const [closingReason, setClosingReason] = React.useState('')

  const closeMutation = useCloseBillingServiceCase()
  const isSubmitting = closeMutation.isPending

  React.useEffect(() => {
    if (open) {
      setClosingReason('')
    }
  }, [open])

  const handleSubmit = async () => {
    if (!closingReason.trim()) return

    try {
      await closeMutation.mutateAsync({
        id: serviceCaseId,
        closingReason: closingReason.trim(),
      })
      toast.success('Serviceauftrag abgeschlossen')
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Abschließen'
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Serviceauftrag abschließen</DialogTitle>
          <DialogDescription>
            {`"${serviceCaseTitle}" wird abgeschlossen. Nach dem Abschließen ist der Serviceauftrag nicht mehr bearbeitbar.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="closingReason">Abschlussgrund *</Label>
            <Textarea
              id="closingReason"
              value={closingReason}
              onChange={(e) => setClosingReason(e.target.value)}
              disabled={isSubmitting}
              rows={3}
              placeholder="z.B. Reparatur abgeschlossen"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !closingReason.trim()}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Abschließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

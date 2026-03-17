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
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useForwardBillingDocument } from '@/hooks'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

const FORWARDING_RULES: Record<string, { type: string; label: string }[]> = {
  OFFER: [{ type: 'ORDER_CONFIRMATION', label: 'Auftragsbestätigung' }],
  ORDER_CONFIRMATION: [
    { type: 'DELIVERY_NOTE', label: 'Lieferschein' },
    { type: 'SERVICE_NOTE', label: 'Leistungsschein' },
  ],
  DELIVERY_NOTE: [{ type: 'INVOICE', label: 'Rechnung' }],
  SERVICE_NOTE: [{ type: 'INVOICE', label: 'Rechnung' }],
  RETURN_DELIVERY: [{ type: 'CREDIT_NOTE', label: 'Gutschrift' }],
  INVOICE: [],
  CREDIT_NOTE: [],
}

interface DocumentForwardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  documentType: string
  documentNumber: string
}

export function DocumentForwardDialog({
  open,
  onOpenChange,
  documentId,
  documentType,
  documentNumber,
}: DocumentForwardDialogProps) {
  const router = useRouter()
  const forwardMutation = useForwardBillingDocument()
  const allowedTargets = FORWARDING_RULES[documentType] ?? []
  const [selectedType, setSelectedType] = React.useState(allowedTargets[0]?.type ?? '')

  const handleForward = async () => {
    if (!selectedType) return
    try {
      const result = await forwardMutation.mutateAsync({
        id: documentId,
        targetType: selectedType as "ORDER_CONFIRMATION" | "DELIVERY_NOTE" | "SERVICE_NOTE" | "INVOICE" | "CREDIT_NOTE",
      })
      toast.success('Beleg erfolgreich fortgeführt')
      onOpenChange(false)
      if (result?.id) {
        router.push(`/orders/documents/${result.id}`)
      }
    } catch {
      toast.error('Fehler beim Fortführen')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Beleg fortführen</DialogTitle>
          <DialogDescription>
            Beleg {documentNumber} als neuen Beleg fortführen.
          </DialogDescription>
        </DialogHeader>
        {allowedTargets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Dieser Belegtyp kann nicht fortgeführt werden.</p>
        ) : (
          <RadioGroup value={selectedType} onValueChange={setSelectedType}>
            {allowedTargets.map((target) => (
              <div key={target.type} className="flex items-center space-x-2">
                <RadioGroupItem value={target.type} id={target.type} />
                <Label htmlFor={target.type}>{target.label}</Label>
              </div>
            ))}
          </RadioGroup>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleForward}
            disabled={!selectedType || forwardMutation.isPending}
          >
            {forwardMutation.isPending ? 'Wird fortgeführt...' : 'Fortführen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

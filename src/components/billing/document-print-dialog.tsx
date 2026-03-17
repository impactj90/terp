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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import { useFinalizeBillingDocument } from '@/hooks'
import { toast } from 'sonner'

interface DocumentFinalizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  documentNumber: string
  documentType: string
}

export function DocumentFinalizeDialog({
  open,
  onOpenChange,
  documentId,
  documentNumber,
  documentType,
}: DocumentFinalizeDialogProps) {
  const finalizeMutation = useFinalizeBillingDocument()
  const isOrderConfirmation = documentType === 'ORDER_CONFIRMATION'

  const [orderName, setOrderName] = React.useState('')
  const [orderDescription, setOrderDescription] = React.useState('')

  // Reset fields when dialog opens
  React.useEffect(() => {
    if (open) {
      setOrderName('')
      setOrderDescription('')
    }
  }, [open])

  const handleFinalize = async () => {
    try {
      await finalizeMutation.mutateAsync({
        id: documentId,
        ...(isOrderConfirmation && orderName.trim()
          ? { orderName: orderName.trim(), orderDescription: orderDescription.trim() || undefined }
          : {}),
      })
      toast.success(
        isOrderConfirmation && orderName.trim()
          ? 'Beleg abgeschlossen und Auftrag erstellt'
          : 'Beleg erfolgreich abgeschlossen'
      )
      onOpenChange(false)
    } catch {
      toast.error('Fehler beim Abschließen')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Beleg abschließen</DialogTitle>
          <DialogDescription>
            Beleg {documentNumber} abschließen und festschreiben.
          </DialogDescription>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Nach dem Abschließen ist der Beleg unveränderbar. Positionen und Kopfdaten können nicht mehr bearbeitet werden.
          </AlertDescription>
        </Alert>

        {isOrderConfirmation && (
          <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
            <div>
              <p className="text-sm font-medium">Auftrag für Zeiterfassung erstellen</p>
              <p className="text-xs text-muted-foreground">
                Optional: Erstellen Sie einen Terp-Auftrag, auf den Mitarbeiter Zeit buchen können.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderName">Auftragsbezeichnung</Label>
              <Input
                id="orderName"
                value={orderName}
                onChange={(e) => setOrderName(e.target.value)}
                placeholder="z.B. Beratungsprojekt Mustermann"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderDescription">Beschreibung (optional)</Label>
              <Input
                id="orderDescription"
                value={orderDescription}
                onChange={(e) => setOrderDescription(e.target.value)}
                placeholder="z.B. Sollstunden: 40h, Montage + Dokumentation"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleFinalize}
            disabled={finalizeMutation.isPending}
          >
            {finalizeMutation.isPending ? 'Wird abgeschlossen...' : 'Abschließen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useCreateInvoiceFromServiceCase } from '@/hooks'
import { toast } from 'sonner'

interface Position {
  description: string
  quantity: number | undefined
  unit: string
  unitPrice: number | undefined
  flatCosts: number | undefined
  vatRate: number | undefined
}

const EMPTY_POSITION: Position = {
  description: '',
  quantity: undefined,
  unit: '',
  unitPrice: undefined,
  flatCosts: undefined,
  vatRate: 19,
}

interface ServiceCaseInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceCaseId: string
  onInvoiceCreated?: (invoiceId: string) => void
}

export function ServiceCaseInvoiceDialog({
  open,
  onOpenChange,
  serviceCaseId,
  onInvoiceCreated,
}: ServiceCaseInvoiceDialogProps) {
  const [positions, setPositions] = React.useState<Position[]>([{ ...EMPTY_POSITION }])

  const createInvoiceMutation = useCreateInvoiceFromServiceCase()
  const isSubmitting = createInvoiceMutation.isPending

  React.useEffect(() => {
    if (open) {
      setPositions([{ ...EMPTY_POSITION }])
    }
  }, [open])

  const addPosition = () => {
    setPositions([...positions, { ...EMPTY_POSITION }])
  }

  const removePosition = (index: number) => {
    setPositions(positions.filter((_, i) => i !== index))
  }

  const updatePosition = (index: number, field: keyof Position, value: string | number | undefined) => {
    const updated = [...positions]
    updated[index] = { ...updated[index]!, [field]: value }
    setPositions(updated)
  }

  const handleSubmit = async () => {
    // Validate at least one position has a description
    const validPositions = positions.filter((p) => p.description.trim())
    if (validPositions.length === 0) {
      toast.error('Mindestens eine Position mit Beschreibung erforderlich')
      return
    }

    try {
      const result = await createInvoiceMutation.mutateAsync({
        id: serviceCaseId,
        positions: validPositions.map((p) => ({
          description: p.description,
          quantity: p.quantity,
          unit: p.unit || undefined,
          unitPrice: p.unitPrice,
          flatCosts: p.flatCosts,
          vatRate: p.vatRate,
        })),
      })
      toast.success('Rechnung erstellt')
      onOpenChange(false)
      if (onInvoiceCreated && result?.invoiceDocumentId) {
        onInvoiceCreated(result.invoiceDocumentId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Erstellen der Rechnung'
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Rechnung erstellen</DialogTitle>
          <DialogDescription>
            Erstellt eine Rechnung aus diesem Serviceauftrag. Fügen Sie die Positionen hinzu.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {positions.map((pos, index) => (
            <div key={index} className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Position {index + 1}</span>
                {positions.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removePosition(index)}
                    disabled={isSubmitting}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label>Beschreibung *</Label>
                <Input
                  value={pos.description}
                  onChange={(e) => updatePosition(index, 'description', e.target.value)}
                  disabled={isSubmitting}
                  placeholder="z.B. Arbeitszeit Techniker"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Menge</Label>
                  <Input
                    type="number"
                    value={pos.quantity ?? ''}
                    onChange={(e) => updatePosition(index, 'quantity', e.target.value ? Number(e.target.value) : undefined)}
                    disabled={isSubmitting}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Einheit</Label>
                  <Input
                    value={pos.unit}
                    onChange={(e) => updatePosition(index, 'unit', e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Std"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Einzelpreis</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={pos.unitPrice ?? ''}
                    onChange={(e) => updatePosition(index, 'unitPrice', e.target.value ? Number(e.target.value) : undefined)}
                    disabled={isSubmitting}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">MwSt %</Label>
                  <Input
                    type="number"
                    value={pos.vatRate ?? ''}
                    onChange={(e) => updatePosition(index, 'vatRate', e.target.value ? Number(e.target.value) : undefined)}
                    disabled={isSubmitting}
                    placeholder="19"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Pauschalkosten</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={pos.flatCosts ?? ''}
                  onChange={(e) => updatePosition(index, 'flatCosts', e.target.value ? Number(e.target.value) : undefined)}
                  disabled={isSubmitting}
                  placeholder="Optional"
                  className="max-w-32"
                />
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={addPosition}
            disabled={isSubmitting}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-1" />
            Position hinzufügen
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Rechnung erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

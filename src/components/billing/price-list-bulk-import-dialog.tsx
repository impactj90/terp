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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useBulkImportBillingPriceListEntries } from '@/hooks'
import { toast } from 'sonner'

interface ParsedEntry {
  itemKey?: string
  description?: string
  unitPrice: number
  minQuantity?: number
  unit?: string
}

function parseCsvInput(text: string): { entries: ParsedEntry[]; errors: string[] } {
  const lines = text.trim().split('\n').filter(l => l.trim().length > 0)
  const entries: ParsedEntry[] = []
  const errors: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    // Support both semicolon and tab separation
    const parts = line.includes(';') ? line.split(';') : line.split('\t')
    if (parts.length < 3) {
      errors.push(`Zeile ${i + 1}: Mindestens 3 Felder erwartet (Schlüssel;Beschreibung;Einzelpreis)`)
      continue
    }

    const priceStr = parts[2] ?? ''
    const unitPrice = parseFloat(priceStr.trim().replace(',', '.'))
    if (isNaN(unitPrice)) {
      errors.push(`Zeile ${i + 1}: Ungültiger Einzelpreis "${priceStr.trim()}"`)
      continue
    }

    const minQtyStr = parts[3]?.trim()
    const minQty = minQtyStr ? parseFloat(minQtyStr.replace(',', '.')) : undefined
    if (minQtyStr && minQty !== undefined && isNaN(minQty)) {
      errors.push(`Zeile ${i + 1}: Ungültige Menge "${minQtyStr}"`)
      continue
    }

    const col0 = parts[0] ?? ''
    const col1 = parts[1] ?? ''
    entries.push({
      itemKey: col0.trim() || undefined,
      description: col1.trim() || undefined,
      unitPrice,
      minQuantity: minQty,
      unit: parts[4]?.trim() || undefined,
    })
  }

  return { entries, errors }
}

interface PriceListBulkImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  priceListId: string
}

export function PriceListBulkImportDialog({
  open,
  onOpenChange,
  priceListId,
}: PriceListBulkImportDialogProps) {
  const [csvText, setCsvText] = React.useState('')
  const [parseResult, setParseResult] = React.useState<{ entries: ParsedEntry[]; errors: string[] } | null>(null)
  const importMutation = useBulkImportBillingPriceListEntries()

  React.useEffect(() => {
    if (open) {
      setCsvText('')
      setParseResult(null)
    }
  }, [open])

  const handleParse = () => {
    const result = parseCsvInput(csvText)
    setParseResult(result)
  }

  const handleImport = async () => {
    if (!parseResult || parseResult.entries.length === 0) return

    try {
      const result = await importMutation.mutateAsync({
        priceListId,
        entries: parseResult.entries.map(e => ({
          ...(e.itemKey ? { itemKey: e.itemKey } : {}),
          ...(e.description ? { description: e.description } : {}),
          unitPrice: e.unitPrice,
          ...(e.minQuantity != null ? { minQuantity: e.minQuantity } : {}),
          ...(e.unit ? { unit: e.unit } : {}),
        })),
      })
      toast.success(`${result.created} Einträge erstellt, ${result.updated} aktualisiert`)
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message || 'Fehler beim Import')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Massenimport</DialogTitle>
          <DialogDescription>
            Einträge im Format einfügen (semikolon- oder tabulatorgetrennt):
            Schlüssel;Beschreibung;Einzelpreis;Ab Menge;Einheit
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-csv">Daten</Label>
            <Textarea
              id="bulk-csv"
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setParseResult(null) }}
              rows={8}
              placeholder={`beratung_std;Beratung Standard;120;;Std\nberatung_senior;Beratung Senior;150;;Std\nmontage;Montagearbeiten;85;;Std`}
              className="font-mono text-sm"
            />
          </div>

          {parseResult && parseResult.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-1">
                  {parseResult.errors.map((err, i) => (
                    <li key={i} className="text-sm">{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {parseResult && parseResult.entries.length > 0 && (
            <Alert>
              <AlertDescription>
                {parseResult.entries.length} Einträge erkannt, bereit zum Import.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          {!parseResult ? (
            <Button onClick={handleParse} disabled={!csvText.trim()}>
              Vorschau
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending || parseResult.entries.length === 0}
            >
              {importMutation.isPending ? 'Wird importiert...' : 'Importieren'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

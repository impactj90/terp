'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import {
  useCreateBillingPriceList,
  useUpdateBillingPriceList,
} from '@/hooks'
import { toast } from 'sonner'

interface FormState {
  name: string
  description: string
  isDefault: boolean
  validFrom: string
  validTo: string
}

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  isDefault: false,
  validFrom: '',
  validTo: '',
}

interface PriceListFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editItem?: Record<string, unknown> | null
  type?: 'sales' | 'purchase'
}

export function PriceListFormSheet({
  open,
  onOpenChange,
  editItem,
  type = 'sales',
}: PriceListFormSheetProps) {
  const isEdit = !!editItem
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState('')

  const createMutation = useCreateBillingPriceList()
  const updateMutation = useUpdateBillingPriceList()
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  React.useEffect(() => {
    if (open) {
      if (editItem) {
        setForm({
          name: (editItem.name as string) || '',
          description: (editItem.description as string) || '',
          isDefault: (editItem.isDefault as boolean) || false,
          validFrom: editItem.validFrom
            ? new Date(editItem.validFrom as string).toISOString().slice(0, 10)
            : '',
          validTo: editItem.validTo
            ? new Date(editItem.validTo as string).toISOString().slice(0, 10)
            : '',
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError('')
    }
  }, [open, editItem])

  const handleClose = () => {
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('Name ist ein Pflichtfeld')
      return
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: editItem!.id as string,
          name: form.name,
          description: form.description || null,
          isDefault: form.isDefault,
          validFrom: form.validFrom ? new Date(form.validFrom) : null,
          validTo: form.validTo ? new Date(form.validTo) : null,
        })
        toast.success('Preisliste aktualisiert')
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          type,
          ...(form.description ? { description: form.description } : {}),
          isDefault: form.isDefault,
          ...(form.validFrom ? { validFrom: new Date(form.validFrom) } : {}),
          ...(form.validTo ? { validTo: new Date(form.validTo) } : {}),
        })
        toast.success('Preisliste erstellt')
      }
      handleClose()
    } catch (err) {
      let message = 'Fehler beim Speichern'
      if (err instanceof Error) {
        try {
          JSON.parse(err.message)
          message = 'Ungültige Eingabe. Bitte prüfen Sie Ihre Angaben.'
        } catch {
          message = err.message
        }
      }
      setError(message)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Preisliste bearbeiten' : 'Neue Preisliste'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="pl-name">Name *</Label>
              <Input
                id="pl-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={isSubmitting}
                placeholder="z.B. Standardpreisliste"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="pl-description">Beschreibung</Label>
              <Textarea
                id="pl-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={isSubmitting}
                rows={3}
                placeholder="Optionale Beschreibung"
              />
            </div>

            {/* Is Default */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="pl-is-default"
                checked={form.isDefault}
                onCheckedChange={(checked) =>
                  setForm({ ...form, isDefault: checked === true })
                }
                disabled={isSubmitting}
              />
              <div>
                <Label htmlFor="pl-is-default" className="text-sm font-normal">
                  Standardpreisliste
                </Label>
                <p className="text-xs text-muted-foreground">
                  Als Fallback für Kunden ohne eigene Preisliste verwenden
                </p>
              </div>
            </div>

            {/* Valid From */}
            <div className="space-y-2">
              <Label htmlFor="pl-valid-from">Gültig von</Label>
              <Input
                id="pl-valid-from"
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                disabled={isSubmitting}
              />
            </div>

            {/* Valid To */}
            <div className="space-y-2">
              <Label htmlFor="pl-valid-to">Gültig bis</Label>
              <Input
                id="pl-valid-to"
                type="date"
                value={form.validTo}
                onChange={(e) => setForm({ ...form, validTo: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

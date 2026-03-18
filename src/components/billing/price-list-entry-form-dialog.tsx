'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useCreateBillingPriceListEntry,
  useUpdateBillingPriceListEntry,
} from '@/hooks'
import { toast } from 'sonner'

interface EntryFormState {
  articleId: string
  itemKey: string
  description: string
  unitPrice: string
  minQuantity: string
  unit: string
  validFrom: string
  validTo: string
}

const INITIAL_STATE: EntryFormState = {
  articleId: '',
  itemKey: '',
  description: '',
  unitPrice: '',
  minQuantity: '',
  unit: '',
  validFrom: '',
  validTo: '',
}

interface PriceListEntryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  priceListId: string
  editItem?: Record<string, unknown> | null
}

export function PriceListEntryFormDialog({
  open,
  onOpenChange,
  priceListId,
  editItem,
}: PriceListEntryFormDialogProps) {
  const isEdit = !!editItem
  const [form, setForm] = React.useState<EntryFormState>(INITIAL_STATE)
  const [tab, setTab] = React.useState<string>('free')

  const createMutation = useCreateBillingPriceListEntry()
  const updateMutation = useUpdateBillingPriceListEntry()
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  React.useEffect(() => {
    if (open) {
      if (editItem) {
        setForm({
          articleId: (editItem.articleId as string) || '',
          itemKey: (editItem.itemKey as string) || '',
          description: (editItem.description as string) || '',
          unitPrice: editItem.unitPrice != null ? String(editItem.unitPrice) : '',
          minQuantity: editItem.minQuantity != null ? String(editItem.minQuantity) : '',
          unit: (editItem.unit as string) || '',
          validFrom: editItem.validFrom
            ? new Date(editItem.validFrom as string).toISOString().slice(0, 10)
            : '',
          validTo: editItem.validTo
            ? new Date(editItem.validTo as string).toISOString().slice(0, 10)
            : '',
        })
        setTab(editItem.articleId ? 'article' : 'free')
      } else {
        setForm(INITIAL_STATE)
        setTab('free')
      }
    }
  }, [open, editItem])

  const handleSubmit = async () => {
    const unitPrice = parseFloat(form.unitPrice)
    if (isNaN(unitPrice)) {
      toast.error('Einzelpreis ist ein Pflichtfeld')
      return
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: editItem!.id as string,
          priceListId,
          description: form.description || null,
          unitPrice,
          minQuantity: form.minQuantity ? parseFloat(form.minQuantity) : null,
          unit: form.unit || null,
          validFrom: form.validFrom ? new Date(form.validFrom) : null,
          validTo: form.validTo ? new Date(form.validTo) : null,
        })
        toast.success('Eintrag aktualisiert')
      } else {
        await createMutation.mutateAsync({
          priceListId,
          ...(tab === 'article' && form.articleId ? { articleId: form.articleId } : {}),
          ...(tab === 'free' && form.itemKey ? { itemKey: form.itemKey } : {}),
          ...(form.description ? { description: form.description } : {}),
          unitPrice,
          ...(form.minQuantity ? { minQuantity: parseFloat(form.minQuantity) } : {}),
          ...(form.unit ? { unit: form.unit } : {}),
          ...(form.validFrom ? { validFrom: new Date(form.validFrom) } : {}),
          ...(form.validTo ? { validTo: new Date(form.validTo) } : {}),
        })
        toast.success('Eintrag erstellt')
      }
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message || 'Fehler beim Speichern')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!isEdit && (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="free">Freier Eintrag</TabsTrigger>
                <TabsTrigger value="article">Artikel</TabsTrigger>
              </TabsList>
              <TabsContent value="free">
                <div className="space-y-2">
                  <Label htmlFor="entry-item-key">Schlüssel</Label>
                  <Input
                    id="entry-item-key"
                    value={form.itemKey}
                    onChange={(e) => setForm({ ...form, itemKey: e.target.value })}
                    disabled={isSubmitting}
                    placeholder="z.B. beratung_std"
                  />
                </div>
              </TabsContent>
              <TabsContent value="article">
                <div className="space-y-2">
                  <Label htmlFor="entry-article">Artikel-ID</Label>
                  <Input
                    id="entry-article"
                    value={form.articleId}
                    onChange={(e) => setForm({ ...form, articleId: e.target.value })}
                    disabled={isSubmitting}
                    placeholder="Artikel-UUID"
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="entry-description">Beschreibung</Label>
            <Input
              id="entry-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={isSubmitting}
              placeholder="Beschreibung des Eintrags"
            />
          </div>

          {/* Unit Price */}
          <div className="space-y-2">
            <Label htmlFor="entry-unit-price">Einzelpreis (EUR) *</Label>
            <Input
              id="entry-unit-price"
              type="number"
              step="0.01"
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
              disabled={isSubmitting}
              placeholder="0.00"
            />
          </div>

          {/* Min Quantity */}
          <div className="space-y-2">
            <Label htmlFor="entry-min-quantity">Ab Menge</Label>
            <Input
              id="entry-min-quantity"
              type="number"
              step="0.01"
              value={form.minQuantity}
              onChange={(e) => setForm({ ...form, minQuantity: e.target.value })}
              disabled={isSubmitting}
              placeholder="Leer = Standardpreis"
            />
          </div>

          {/* Unit */}
          <div className="space-y-2">
            <Label htmlFor="entry-unit">Einheit</Label>
            <Input
              id="entry-unit"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              disabled={isSubmitting}
              placeholder="z.B. Std, Stk, kg"
            />
          </div>

          {/* Valid From */}
          <div className="space-y-2">
            <Label htmlFor="entry-valid-from">Gültig von</Label>
            <Input
              id="entry-valid-from"
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          {/* Valid To */}
          <div className="space-y-2">
            <Label htmlFor="entry-valid-to">Gültig bis</Label>
            <Input
              id="entry-valid-to"
              type="date"
              value={form.validTo}
              onChange={(e) => setForm({ ...form, validTo: e.target.value })}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Wird gespeichert...' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

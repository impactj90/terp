'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreateWhArticle,
  useUpdateWhArticle,
  useWhArticleGroups,
} from '@/hooks'

interface FormState {
  name: string
  description: string
  groupId: string
  matchCode: string
  unit: string
  vatRate: string
  sellPrice: string
  buyPrice: string
  discountGroup: string
  orderType: string
  stockTracking: boolean
  minStock: string
  warehouseLocation: string
}

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  groupId: '',
  matchCode: '',
  unit: 'Stk',
  vatRate: '19',
  sellPrice: '',
  buyPrice: '',
  discountGroup: '',
  orderType: '',
  stockTracking: false,
  minStock: '',
  warehouseLocation: '',
}

const UNITS = ['Stk', 'kg', 'm', 'Std', 'l', 'Paar', 'Pkt', 'Set']

interface ArticleFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  article?: Record<string, unknown> | null
}

// Flatten tree nodes for select options
type GroupTreeNode = {
  group: { id: string; name: string }
  children: GroupTreeNode[]
}

function flattenGroups(
  nodes: GroupTreeNode[],
  depth = 0
): Array<{ id: string; name: string; depth: number }> {
  const result: Array<{ id: string; name: string; depth: number }> = []
  for (const node of nodes) {
    result.push({ id: node.group.id, name: node.group.name, depth })
    result.push(...flattenGroups(node.children, depth + 1))
  }
  return result
}

export function ArticleFormSheet({ open, onOpenChange, article }: ArticleFormSheetProps) {
  const isEdit = !!article
  const createArticle = useCreateWhArticle()
  const updateArticle = useUpdateWhArticle()
  const { data: groupTree } = useWhArticleGroups(open)
  const flatGroups = React.useMemo(
    () => (groupTree ? flattenGroups(groupTree) : []),
    [groupTree]
  )

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)

  React.useEffect(() => {
    if (article) {
      setForm({
        name: (article.name as string) || '',
        description: (article.description as string) || '',
        groupId: (article.groupId as string) || '',
        matchCode: (article.matchCode as string) || '',
        unit: (article.unit as string) || 'Stk',
        vatRate: String(article.vatRate ?? 19),
        sellPrice: article.sellPrice != null ? String(article.sellPrice) : '',
        buyPrice: article.buyPrice != null ? String(article.buyPrice) : '',
        discountGroup: (article.discountGroup as string) || '',
        orderType: (article.orderType as string) || '',
        stockTracking: (article.stockTracking as boolean) || false,
        minStock: article.minStock != null ? String(article.minStock) : '',
        warehouseLocation: (article.warehouseLocation as string) || '',
      })
    } else {
      setForm(INITIAL_STATE)
    }
  }, [article, open])

  const isPending = createArticle.isPending || updateArticle.isPending

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return

    const payload = {
      name: form.name.trim(),
      description: form.description || undefined,
      groupId: form.groupId || undefined,
      matchCode: form.matchCode || undefined,
      unit: form.unit || 'Stk',
      vatRate: parseFloat(form.vatRate) || 19,
      sellPrice: form.sellPrice ? parseFloat(form.sellPrice) : undefined,
      buyPrice: form.buyPrice ? parseFloat(form.buyPrice) : undefined,
      discountGroup: form.discountGroup || undefined,
      orderType: form.orderType || undefined,
      stockTracking: form.stockTracking,
      minStock: form.minStock ? parseFloat(form.minStock) : undefined,
      warehouseLocation: form.warehouseLocation || undefined,
    }

    if (isEdit) {
      updateArticle.mutate(
        { id: article.id as string, ...payload },
        {
          onSuccess: () => {
            toast.success('Artikel aktualisiert')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    } else {
      createArticle.mutate(payload, {
        onSuccess: () => {
          toast.success('Artikel erstellt')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Artikel bearbeiten' : 'Neuer Artikel'}</SheetTitle>
          <SheetDescription>
            {isEdit ? 'Artikeldaten aktualisieren' : 'Neuen Artikel anlegen'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Bezeichnung *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>

          {/* Group */}
          <div className="space-y-2">
            <Label>Artikelgruppe</Label>
            <Select
              value={form.groupId || '_none'}
              onValueChange={(v) => setForm({ ...form, groupId: v === '_none' ? '' : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Keine Gruppe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Keine Gruppe</SelectItem>
                {flatGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {'  '.repeat(g.depth)}{g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Unit */}
          <div className="space-y-2">
            <Label>Einheit</Label>
            <Select
              value={form.unit}
              onValueChange={(v) => setForm({ ...form, unit: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Match Code */}
          <div className="space-y-2">
            <Label htmlFor="matchCode">Matchcode</Label>
            <Input
              id="matchCode"
              value={form.matchCode}
              onChange={(e) => setForm({ ...form, matchCode: e.target.value })}
              placeholder="Auto-generiert aus Name"
            />
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sellPrice">VK-Preis (netto)</Label>
              <Input
                id="sellPrice"
                type="number"
                step="0.01"
                value={form.sellPrice}
                onChange={(e) => setForm({ ...form, sellPrice: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyPrice">EK-Preis</Label>
              <Input
                id="buyPrice"
                type="number"
                step="0.01"
                value={form.buyPrice}
                onChange={(e) => setForm({ ...form, buyPrice: e.target.value })}
              />
            </div>
          </div>

          {/* VAT */}
          <div className="space-y-2">
            <Label htmlFor="vatRate">MwSt-Satz (%)</Label>
            <Input
              id="vatRate"
              type="number"
              step="0.1"
              value={form.vatRate}
              onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
            />
          </div>

          {/* Discount Group / Order Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="discountGroup">Rabattgruppe</Label>
              <Input
                id="discountGroup"
                value={form.discountGroup}
                onChange={(e) => setForm({ ...form, discountGroup: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderType">Bestellart</Label>
              <Input
                id="orderType"
                value={form.orderType}
                onChange={(e) => setForm({ ...form, orderType: e.target.value })}
              />
            </div>
          </div>

          {/* Stock Tracking */}
          <div className="flex items-center justify-between">
            <Label htmlFor="stockTracking">Bestandsfuehrung</Label>
            <Switch
              id="stockTracking"
              checked={form.stockTracking}
              onCheckedChange={(checked) => setForm({ ...form, stockTracking: checked })}
            />
          </div>

          {form.stockTracking && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minStock">Mindestbestand</Label>
                <Input
                  id="minStock"
                  type="number"
                  step="0.01"
                  value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouseLocation">Lagerort</Label>
                <Input
                  id="warehouseLocation"
                  value={form.warehouseLocation}
                  onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })}
                />
              </div>
            </div>
          )}

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending || !form.name.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Speichern' : 'Erstellen'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

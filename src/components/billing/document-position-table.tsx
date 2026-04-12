'use client'

import * as React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import {
  useAddBillingPosition,
  useUpdateBillingPosition,
  useDeleteBillingPosition,
  usePriceListEntriesForAddress,
} from '@/hooks'
import { useTRPC } from '@/trpc'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

interface Position {
  id: string
  sortOrder: number
  type: string
  articleId?: string | null
  articleNumber?: string | null
  description?: string | null
  quantity?: number | null
  unit?: string | null
  unitPrice?: number | null
  flatCosts?: number | null
  totalPrice?: number | null
  priceType?: string | null
  vatRate?: number | null
}

interface PriceEntry {
  id: string
  articleId: string | null
  itemKey: string | null
  description: string | null
  unitPrice: number
  unit: string | null
  minQuantity: number | null
}

interface DocumentPositionTableProps {
  documentId: string
  positions: Position[]
  readonly?: boolean
  addressId?: string
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return ''
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

const POSITION_TYPE_LABELS: Record<string, string> = {
  ARTICLE: 'Artikel',
  FREE: 'Freitext',
  TEXT: 'Textzeile',
  PAGE_BREAK: 'Seitenumbruch',
  SUBTOTAL: 'Zwischensumme',
}

// --- Description Combobox ---

interface DescriptionComboboxProps {
  defaultValue: string
  entries: PriceEntry[]
  onCommit: (description: string) => void
  onSelectEntry: (entry: PriceEntry) => void
}

function DescriptionCombobox({ defaultValue, entries, onCommit, onSelectEntry }: DescriptionComboboxProps) {
  const [value, setValue] = React.useState(defaultValue)
  const [open, setOpen] = React.useState(false)

  const filtered = React.useMemo(() => {
    if (!value.trim()) return entries
    const term = value.toLowerCase()
    return entries.filter(
      (e) =>
        e.itemKey?.toLowerCase().includes(term) ||
        e.description?.toLowerCase().includes(term)
    )
  }, [value, entries])

  const handleBlur = () => {
    // Small delay to allow mousedown on popover item to fire first
    setTimeout(() => {
      setOpen(false)
      if (value !== defaultValue) {
        onCommit(value)
      }
    }, 150)
  }

  const handleSelect = (entry: PriceEntry) => {
    const desc = entry.description || entry.itemKey || ''
    setValue(desc)
    setOpen(false)
    onSelectEntry(entry)
  }

  return (
    <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => {
            if (entries.length > 0) setOpen(true)
          }}
          onBlur={handleBlur}
          className="h-8"
          placeholder="Beschreibung"
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-[350px] p-0"
        align="start"
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(entry)
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {entry.itemKey}
                </span>
                <span className="truncate">{entry.description}</span>
              </span>
              <span className="shrink-0 text-xs font-medium">
                {formatCurrency(entry.unitPrice)}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// --- Main Component ---

export function DocumentPositionTable({
  documentId,
  positions,
  readonly = false,
  addressId,
}: DocumentPositionTableProps) {
  const tc = useTranslations('common')
  const addMutation = useAddBillingPosition()
  const updateMutation = useUpdateBillingPosition()
  const deleteMutation = useDeleteBillingPosition()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [addType, setAddType] = React.useState('FREE')

  // Fetch price list entries for autocomplete
  const { data: priceListData } = usePriceListEntriesForAddress(addressId, !readonly && !!addressId)
  const priceEntries = priceListData?.entries ?? []

  const handleAdd = async () => {
    try {
      await addMutation.mutateAsync({
        documentId,
        type: addType as "FREE" | "ARTICLE" | "TEXT" | "PAGE_BREAK" | "SUBTOTAL",
        description: addType === 'TEXT' ? 'Textzeile' : undefined,
        quantity: addType === 'FREE' || addType === 'ARTICLE' ? 1 : undefined,
        unitPrice: addType === 'FREE' || addType === 'ARTICLE' ? 0 : undefined,
        vatRate: addType === 'FREE' || addType === 'ARTICLE' ? 19 : undefined,
      })
      toast.success('Position hinzugefügt')
    } catch {
      toast.error('Fehler beim Hinzufügen')
    }
  }

  const handleUpdate = async (id: string, field: string, value: string) => {
    const numericFields = ['quantity', 'unitPrice', 'flatCosts', 'vatRate']
    const parsed = numericFields.includes(field) ? parseFloat(value) : value

    if (numericFields.includes(field) && isNaN(parsed as number)) return

    try {
      await updateMutation.mutateAsync({ id, [field]: parsed })

      // Price lookup: when description changes on a priced position, try to look up price by itemKey
      if (field === 'description' && addressId && typeof value === 'string' && value.trim()) {
        const pos = positions.find((p) => p.id === id)
        if (pos && (pos.type === 'FREE' || pos.type === 'ARTICLE')) {
          try {
            const result = await queryClient.fetchQuery(
              trpc.billing.priceLists.lookupPrice.queryOptions({
                addressId,
                itemKey: value.trim(),
              })
            )
            if (result?.unitPrice != null) {
              await updateMutation.mutateAsync({ id, unitPrice: result.unitPrice })
            }
          } catch {
            // No price found — that's fine, user can enter manually
          }
        }
      }
    } catch {
      toast.error('Fehler beim Aktualisieren')
    }
  }

  const handleSelectEntry = async (posId: string, entry: PriceEntry) => {
    try {
      const desc = entry.description || entry.itemKey || ''
      await updateMutation.mutateAsync({
        id: posId,
        description: desc,
        unitPrice: entry.unitPrice,
        ...(entry.unit ? { unit: entry.unit } : {}),
        ...(entry.articleId ? { articleId: entry.articleId, articleNumber: entry.itemKey ?? undefined } : {}),
      })
    } catch {
      toast.error('Fehler beim Aktualisieren')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync({ id })
      toast.success('Position gelöscht')
    } catch {
      toast.error('Fehler beim Löschen')
    }
  }

  const showCombobox = (posType: string) =>
    !readonly && priceEntries.length > 0 && (posType === 'FREE' || posType === 'ARTICLE')

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead className="w-24">Typ</TableHead>
            <TableHead>Beschreibung</TableHead>
            <TableHead className="w-20 text-right">Menge</TableHead>
            <TableHead className="w-16">Einheit</TableHead>
            <TableHead className="w-28 text-right">Einzelpreis</TableHead>
            <TableHead className="w-28 text-right">Pauschal</TableHead>
            <TableHead className="w-20 text-right">MwSt %</TableHead>
            <TableHead className="w-28 text-right">Gesamt</TableHead>
            {!readonly && <TableHead className="w-16" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.length === 0 && (
            <TableRow>
              <TableCell colSpan={readonly ? 9 : 10} className="text-center text-muted-foreground">
                Keine Positionen vorhanden
              </TableCell>
            </TableRow>
          )}
          {positions.map((pos) => (
            <TableRow key={pos.id}>
              <TableCell className="text-muted-foreground">
                {!readonly && <GripVertical className="h-4 w-4 inline mr-1 cursor-grab" />}
                {pos.sortOrder}
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {POSITION_TYPE_LABELS[pos.type] ?? pos.type}
                </span>
              </TableCell>
              <TableCell>
                {readonly ? (
                  pos.description ?? ''
                ) : showCombobox(pos.type) ? (
                  <DescriptionCombobox
                    key={`desc-${pos.id}-${pos.description}`}
                    defaultValue={pos.description ?? ''}
                    entries={priceEntries}
                    onCommit={(desc) => handleUpdate(pos.id, 'description', desc)}
                    onSelectEntry={(entry) => handleSelectEntry(pos.id, entry)}
                  />
                ) : (
                  <Input
                    defaultValue={pos.description ?? ''}
                    onBlur={(e) => handleUpdate(pos.id, 'description', e.target.value)}
                    className="h-8"
                    placeholder="Beschreibung"
                  />
                )}
              </TableCell>
              <TableCell className="text-right">
                {pos.type === 'TEXT' || pos.type === 'PAGE_BREAK' || pos.type === 'SUBTOTAL' ? '' : (
                  readonly ? (pos.quantity ?? '') : (
                    <Input
                      type="number"
                      defaultValue={pos.quantity ?? ''}
                      onBlur={(e) => handleUpdate(pos.id, 'quantity', e.target.value)}
                      className="h-8 text-right w-20"
                    />
                  )
                )}
              </TableCell>
              <TableCell>
                {pos.type === 'TEXT' || pos.type === 'PAGE_BREAK' || pos.type === 'SUBTOTAL' ? '' : (
                  readonly ? (pos.unit ?? '') : (
                    <Input
                      key={`unit-${pos.id}-${pos.unit}`}
                      defaultValue={pos.unit ?? ''}
                      onBlur={(e) => handleUpdate(pos.id, 'unit', e.target.value)}
                      className="h-8 w-16"
                      placeholder="Stk"
                    />
                  )
                )}
              </TableCell>
              <TableCell className="text-right">
                {pos.type === 'TEXT' || pos.type === 'PAGE_BREAK' || pos.type === 'SUBTOTAL' ? '' : (
                  readonly ? formatCurrency(pos.unitPrice) : (
                    <Input
                      key={`unitPrice-${pos.id}-${pos.unitPrice}`}
                      type="number"
                      step="0.01"
                      defaultValue={pos.unitPrice ?? ''}
                      onBlur={(e) => handleUpdate(pos.id, 'unitPrice', e.target.value)}
                      className="h-8 text-right w-28"
                    />
                  )
                )}
              </TableCell>
              <TableCell className="text-right">
                {pos.type === 'TEXT' || pos.type === 'PAGE_BREAK' || pos.type === 'SUBTOTAL' ? '' : (
                  readonly ? formatCurrency(pos.flatCosts) : (
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={pos.flatCosts ?? ''}
                      onBlur={(e) => handleUpdate(pos.id, 'flatCosts', e.target.value)}
                      className="h-8 text-right w-28"
                    />
                  )
                )}
              </TableCell>
              <TableCell className="text-right">
                {pos.type === 'TEXT' || pos.type === 'PAGE_BREAK' || pos.type === 'SUBTOTAL' ? '' : (
                  readonly ? (pos.vatRate ?? '') : (
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={pos.vatRate ?? ''}
                      onBlur={(e) => handleUpdate(pos.id, 'vatRate', e.target.value)}
                      className="h-8 text-right w-20"
                    />
                  )
                )}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(pos.totalPrice)}
              </TableCell>
              {!readonly && (
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(pos.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{tc('delete')}</TooltipContent>
                  </Tooltip>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {!readonly && (
        <div className="flex items-center gap-2">
          <Select value={addType} onValueChange={setAddType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FREE">Freitext</SelectItem>
              <SelectItem value="ARTICLE">Artikel</SelectItem>
              <SelectItem value="TEXT">Textzeile</SelectItem>
              <SelectItem value="PAGE_BREAK">Seitenumbruch</SelectItem>
              <SelectItem value="SUBTOTAL">Zwischensumme</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={addMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />
            Position hinzufügen
          </Button>
        </div>
      )}
    </div>
  )
}

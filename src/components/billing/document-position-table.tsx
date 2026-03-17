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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import {
  useAddBillingPosition,
  useUpdateBillingPosition,
  useDeleteBillingPosition,
} from '@/hooks'
import { toast } from 'sonner'

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

interface DocumentPositionTableProps {
  documentId: string
  positions: Position[]
  readonly?: boolean
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

export function DocumentPositionTable({
  documentId,
  positions,
  readonly = false,
}: DocumentPositionTableProps) {
  const addMutation = useAddBillingPosition()
  const updateMutation = useUpdateBillingPosition()
  const deleteMutation = useDeleteBillingPosition()
  const [addType, setAddType] = React.useState('FREE')

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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDelete(pos.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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

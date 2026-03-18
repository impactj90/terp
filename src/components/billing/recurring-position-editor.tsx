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
import { Plus, Trash2 } from 'lucide-react'

export interface PositionTemplate {
  type: "ARTICLE" | "FREE" | "TEXT"
  articleId?: string
  articleNumber?: string
  description?: string
  quantity?: number
  unit?: string
  unitPrice?: number
  flatCosts?: number
  vatRate?: number
}

interface RecurringPositionEditorProps {
  positions: PositionTemplate[]
  onChange: (positions: PositionTemplate[]) => void
}

function calcTotal(pos: PositionTemplate): number | null {
  const qty = pos.quantity ?? 0
  const price = pos.unitPrice ?? 0
  const flat = pos.flatCosts ?? 0
  if (qty === 0 && price === 0 && flat === 0) return null
  return Math.round((qty * price + flat) * 100) / 100
}

function formatCurrency(value: number | null): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

export function RecurringPositionEditor({ positions, onChange }: RecurringPositionEditorProps) {
  const addPosition = () => {
    onChange([...positions, { type: 'FREE', description: '', quantity: 1, unit: 'Stk', unitPrice: 0, vatRate: 19 }])
  }

  const removePosition = (index: number) => {
    onChange(positions.filter((_, i) => i !== index))
  }

  const updatePosition = (index: number, field: keyof PositionTemplate, value: unknown) => {
    const updated = positions.map((pos, i) => {
      if (i !== index) return pos
      return { ...pos, [field]: value }
    })
    onChange(updated)
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Typ</TableHead>
            <TableHead>Beschreibung</TableHead>
            <TableHead className="w-[80px]">Menge</TableHead>
            <TableHead className="w-[70px]">Einheit</TableHead>
            <TableHead className="w-[100px]">Einzelpreis</TableHead>
            <TableHead className="w-[100px]">Festkosten</TableHead>
            <TableHead className="w-[70px]">MwSt %</TableHead>
            <TableHead className="w-[100px] text-right">Gesamt</TableHead>
            <TableHead className="w-[40px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                Keine Positionen. Klicken Sie &quot;Position hinzufuegen&quot;.
              </TableCell>
            </TableRow>
          ) : (
            positions.map((pos, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Select
                    value={pos.type}
                    onValueChange={(v) => updatePosition(i, 'type', v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARTICLE">Artikel</SelectItem>
                      <SelectItem value="FREE">Freitext</SelectItem>
                      <SelectItem value="TEXT">Text</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    id={`pos-desc-${i}`}
                    className="h-8 text-sm"
                    value={pos.description ?? ''}
                    onChange={(e) => updatePosition(i, 'description', e.target.value)}
                    placeholder="Beschreibung"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-sm w-[70px]"
                    type="number"
                    value={pos.quantity ?? ''}
                    onChange={(e) => updatePosition(i, 'quantity', e.target.value ? parseFloat(e.target.value) : undefined)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-sm w-[60px]"
                    value={pos.unit ?? ''}
                    onChange={(e) => updatePosition(i, 'unit', e.target.value)}
                    placeholder="Stk"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-sm w-[90px]"
                    type="number"
                    step="0.01"
                    value={pos.unitPrice ?? ''}
                    onChange={(e) => updatePosition(i, 'unitPrice', e.target.value ? parseFloat(e.target.value) : undefined)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-sm w-[90px]"
                    type="number"
                    step="0.01"
                    value={pos.flatCosts ?? ''}
                    onChange={(e) => updatePosition(i, 'flatCosts', e.target.value ? parseFloat(e.target.value) : undefined)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-sm w-[60px]"
                    type="number"
                    value={pos.vatRate ?? ''}
                    onChange={(e) => updatePosition(i, 'vatRate', e.target.value ? parseFloat(e.target.value) : undefined)}
                  />
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {formatCurrency(calcTotal(pos))}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removePosition(i)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Button type="button" variant="outline" size="sm" onClick={addPosition}>
        <Plus className="h-3 w-3 mr-1" />
        Position hinzufuegen
      </Button>
    </div>
  )
}

'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

export interface LineItem {
  position: number
  articleNumber: string
  description: string
  quantity: number | null
  unit: string
  unitPriceNet: number | null
  totalNet: number | null
  vatRate: number | null
  vatAmount: number | null
  totalGross: number | null
}

interface Props {
  items: LineItem[]
  onChange: (items: LineItem[]) => void
  readonly?: boolean
  headerTotalNet?: number | null
}

function calcLine(item: LineItem): LineItem {
  const qty = item.quantity ?? 0
  const price = item.unitPriceNet ?? 0
  const rate = item.vatRate ?? 0
  const totalNet = qty * price
  const vatAmount = totalNet * rate / 100
  return { ...item, totalNet, vatAmount, totalGross: totalNet + vatAmount }
}

function emptyLine(position: number): LineItem {
  return {
    position,
    articleNumber: '',
    description: '',
    quantity: null,
    unit: 'Stk',
    unitPriceNet: null,
    totalNet: null,
    vatRate: 19,
    vatAmount: null,
    totalGross: null,
  }
}

const fmt = (v: number | null) =>
  v != null ? v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

export function InboundInvoiceLineItems({ items, onChange, readonly, headerTotalNet }: Props) {
  const t = useTranslations('inboundInvoices')

  const updateItem = (idx: number, field: keyof LineItem, value: string | number | null) => {
    const updated = [...items]
    updated[idx] = calcLine({ ...updated[idx]!, [field]: value })
    onChange(updated)
  }

  const addRow = () => {
    onChange([...items, emptyLine(items.length + 1)])
  }

  const removeRow = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx).map((li, i) => ({ ...li, position: i + 1 })))
  }

  const sumNet = items.reduce((s, li) => s + (li.totalNet ?? 0), 0)
  const sumVat = items.reduce((s, li) => s + (li.vatAmount ?? 0), 0)
  const sumGross = items.reduce((s, li) => s + (li.totalGross ?? 0), 0)

  const mismatch = headerTotalNet != null && Math.abs(sumNet - headerTotalNet) > 0.01

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{t('lineItems.colPosition')}</TableHead>
              <TableHead className="w-24">{t('lineItems.colArticleNumber')}</TableHead>
              <TableHead>{t('lineItems.colDescription')}</TableHead>
              <TableHead className="w-16 text-right">{t('lineItems.colQuantity')}</TableHead>
              <TableHead className="w-16">{t('lineItems.colUnit')}</TableHead>
              <TableHead className="w-24 text-right">{t('lineItems.colUnitPrice')}</TableHead>
              <TableHead className="w-24 text-right">{t('lineItems.colNet')}</TableHead>
              <TableHead className="w-16 text-right">{t('lineItems.colVatPercent')}</TableHead>
              <TableHead className="w-24 text-right">{t('lineItems.colVat')}</TableHead>
              <TableHead className="w-24 text-right">{t('lineItems.colGross')}</TableHead>
              {!readonly && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-muted-foreground">{item.position}</TableCell>
                <TableCell>
                  {readonly ? item.articleNumber : (
                    <Input className="h-8" value={item.articleNumber}
                      onChange={(e) => updateItem(idx, 'articleNumber', e.target.value)} />
                  )}
                </TableCell>
                <TableCell>
                  {readonly ? item.description : (
                    <Input className="h-8" value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)} />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {readonly ? fmt(item.quantity) : (
                    <Input className="h-8 text-right" type="number" step="0.01"
                      value={item.quantity ?? ''} onChange={(e) => updateItem(idx, 'quantity', e.target.value ? Number(e.target.value) : null)} />
                  )}
                </TableCell>
                <TableCell>
                  {readonly ? item.unit : (
                    <Input className="h-8 w-14" value={item.unit}
                      onChange={(e) => updateItem(idx, 'unit', e.target.value)} />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {readonly ? fmt(item.unitPriceNet) : (
                    <Input className="h-8 text-right" type="number" step="0.01"
                      value={item.unitPriceNet ?? ''} onChange={(e) => updateItem(idx, 'unitPriceNet', e.target.value ? Number(e.target.value) : null)} />
                  )}
                </TableCell>
                <TableCell className="text-right">{fmt(item.totalNet)}</TableCell>
                <TableCell className="text-right">
                  {readonly ? fmt(item.vatRate) : (
                    <Input className="h-8 text-right w-14" type="number" step="1"
                      value={item.vatRate ?? ''} onChange={(e) => updateItem(idx, 'vatRate', e.target.value ? Number(e.target.value) : null)} />
                  )}
                </TableCell>
                <TableCell className="text-right">{fmt(item.vatAmount)}</TableCell>
                <TableCell className="text-right">{fmt(item.totalGross)}</TableCell>
                {!readonly && (
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => removeRow(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={6} className="text-right font-medium">{t('lineItems.sumLabel')}</TableCell>
              <TableCell className="text-right font-medium">{fmt(sumNet)}</TableCell>
              <TableCell />
              <TableCell className="text-right font-medium">{fmt(sumVat)}</TableCell>
              <TableCell className="text-right font-medium">{fmt(sumGross)}</TableCell>
              {!readonly && <TableCell />}
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {mismatch && (
        <p className="text-sm text-destructive">
          {t('lineItems.mismatchWarning', { sumNet: fmt(sumNet), headerNet: fmt(headerTotalNet) })}
        </p>
      )}

      {!readonly && (
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" /> {t('lineItems.addRow')}
        </Button>
      )}
    </div>
  )
}

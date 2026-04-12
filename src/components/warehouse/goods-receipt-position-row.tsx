'use client'

import { TableCell, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'

interface GoodsReceiptPositionRowProps {
  position: {
    id: string
    articleId: string
    article: { number: string; name: string; unit: string }
    quantity: number
    receivedQuantity: number
  }
  receiveQuantity: number
  onQuantityChange: (positionId: string, quantity: number) => void
}

export function GoodsReceiptPositionRow({
  position,
  receiveQuantity,
  onQuantityChange,
}: GoodsReceiptPositionRowProps) {
  const remaining = position.quantity - position.receivedQuantity
  const isActive = receiveQuantity > 0

  return (
    <TableRow className={isActive ? 'bg-green-50 dark:bg-green-950/20' : undefined}>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {position.article.number}
      </TableCell>
      <TableCell>{position.article.name}</TableCell>
      <TableCell className="text-right font-mono">{position.quantity}</TableCell>
      <TableCell className="text-right font-mono">{position.receivedQuantity}</TableCell>
      <TableCell className="text-right font-mono">{remaining}</TableCell>
      <TableCell className="w-[120px]">
        {remaining > 0 ? (
          <Input
            type="number"
            min={0}
            max={remaining}
            step={1}
            value={receiveQuantity || ''}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0
              onQuantityChange(position.id, Math.min(val, remaining))
            }}
            className="w-24 text-right"
          />
        ) : (
          <span className="text-sm text-muted-foreground text-right block">--</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {position.article.unit}
      </TableCell>
    </TableRow>
  )
}

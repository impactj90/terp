'use client'

import { Card, CardContent } from '@/components/ui/card'

interface DocumentTotalsSummaryProps {
  subtotalNet: number
  totalVat: number
  totalGross: number
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

export function DocumentTotalsSummary({
  subtotalNet,
  totalVat,
  totalGross,
}: DocumentTotalsSummaryProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Netto</span>
            <span>{formatCurrency(subtotalNet)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">MwSt</span>
            <span>{formatCurrency(totalVat)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Brutto</span>
            <span>{formatCurrency(totalGross)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

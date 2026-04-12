'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useBillingOpenItemsSummary } from '@/hooks'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

interface OpenItemsSummaryCardProps {
  addressId?: string
}

export function OpenItemsSummaryCard({ addressId }: OpenItemsSummaryCardProps) {
  const { data, isLoading } = useBillingOpenItemsSummary(addressId)

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="h-12 animate-pulse bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">Gesamt offen</div>
          <div className="text-2xl font-bold">{formatCurrency(data.totalOpen)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {data.countOpen} offen, {data.countPartial} teilbezahlt
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">Überfällig</div>
          <div className="text-2xl font-bold text-red-600">
            {formatCurrency(data.totalOverdue)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {data.countOverdue} Rechnungen
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">Bezahlt</div>
          <div className="text-2xl font-bold text-green-600">{data.countPaid}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Rechnungen vollständig beglichen
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

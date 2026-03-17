'use client'

import { Badge } from '@/components/ui/badge'

const TYPE_CONFIG: Record<string, { label: string; variant: string }> = {
  OFFER: { label: 'Angebot', variant: 'bg-blue-100 text-blue-800' },
  ORDER_CONFIRMATION: { label: 'Auftragsbestätigung', variant: 'bg-indigo-100 text-indigo-800' },
  DELIVERY_NOTE: { label: 'Lieferschein', variant: 'bg-green-100 text-green-800' },
  SERVICE_NOTE: { label: 'Leistungsschein', variant: 'bg-teal-100 text-teal-800' },
  RETURN_DELIVERY: { label: 'Rücklieferung', variant: 'bg-orange-100 text-orange-800' },
  INVOICE: { label: 'Rechnung', variant: 'bg-purple-100 text-purple-800' },
  CREDIT_NOTE: { label: 'Gutschrift', variant: 'bg-pink-100 text-pink-800' },
}

interface DocumentTypeBadgeProps {
  type: string
}

export function DocumentTypeBadge({ type }: DocumentTypeBadgeProps) {
  const config = TYPE_CONFIG[type] ?? { label: type, variant: 'bg-gray-100 text-gray-800' }
  return (
    <Badge variant="outline" className={config.variant}>
      {config.label}
    </Badge>
  )
}

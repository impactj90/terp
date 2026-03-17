'use client'

import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  DRAFT: { label: 'Entwurf', variant: 'bg-gray-100 text-gray-800' },
  PRINTED: { label: 'Abgeschlossen', variant: 'bg-blue-100 text-blue-800' },
  PARTIALLY_FORWARDED: { label: 'Teilw. fortgeführt', variant: 'bg-yellow-100 text-yellow-800' },
  FORWARDED: { label: 'Fortgeführt', variant: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Storniert', variant: 'bg-red-100 text-red-800' },
}

interface DocumentStatusBadgeProps {
  status: string
}

export function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'bg-gray-100 text-gray-800' }
  return (
    <Badge variant="outline" className={config.variant}>
      {config.label}
    </Badge>
  )
}

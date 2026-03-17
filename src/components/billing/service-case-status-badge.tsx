'use client'

import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  OPEN: { label: 'Offen', variant: 'bg-gray-100 text-gray-800' },
  IN_PROGRESS: { label: 'In Bearbeitung', variant: 'bg-blue-100 text-blue-800' },
  CLOSED: { label: 'Abgeschlossen', variant: 'bg-green-100 text-green-800' },
  INVOICED: { label: 'Abgerechnet', variant: 'bg-purple-100 text-purple-800' },
}

interface ServiceCaseStatusBadgeProps {
  status: string
}

export function ServiceCaseStatusBadge({ status }: ServiceCaseStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'bg-gray-100 text-gray-800' }
  return (
    <Badge variant="outline" className={config.variant}>
      {config.label}
    </Badge>
  )
}

'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

type AssignmentRole = 'worker' | 'leader' | 'sales'
type BadgeVariant = 'gray' | 'blue' | 'purple'

interface OrderAssignmentRoleBadgeProps {
  role: string | undefined | null
}

const roleConfig: Record<
  AssignmentRole,
  { labelKey: 'roleWorker' | 'roleLeader' | 'roleSales'; variant: BadgeVariant }
> = {
  worker: {
    labelKey: 'roleWorker' as const,
    variant: 'gray',
  },
  leader: {
    labelKey: 'roleLeader' as const,
    variant: 'blue',
  },
  sales: {
    labelKey: 'roleSales' as const,
    variant: 'purple',
  },
}

/**
 * Badge component for displaying order assignment role.
 */
export function OrderAssignmentRoleBadge({ role }: OrderAssignmentRoleBadgeProps) {
  const t = useTranslations('adminOrders')

  if (!role) {
    return (
      <Badge variant="gray">
        {t('roleWorker')}
      </Badge>
    )
  }

  const config = roleConfig[role as AssignmentRole]

  return (
    <Badge variant={config.variant}>
      {t(config.labelKey)}
    </Badge>
  )
}

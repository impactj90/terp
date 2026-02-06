'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { components } from '@/lib/api/types'

type AssignmentRole = components['schemas']['OrderAssignment']['role']

interface OrderAssignmentRoleBadgeProps {
  role: AssignmentRole | undefined | null
}

const roleConfig: Record<
  NonNullable<AssignmentRole>,
  { labelKey: 'roleWorker' | 'roleLeader' | 'roleSales'; className: string }
> = {
  worker: {
    labelKey: 'roleWorker' as const,
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  leader: {
    labelKey: 'roleLeader' as const,
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  sales: {
    labelKey: 'roleSales' as const,
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
}

/**
 * Badge component for displaying order assignment role.
 */
export function OrderAssignmentRoleBadge({ role }: OrderAssignmentRoleBadgeProps) {
  const t = useTranslations('adminOrders')

  if (!role) {
    return (
      <Badge variant="secondary" className={roleConfig.worker.className}>
        {t('roleWorker')}
      </Badge>
    )
  }

  const config = roleConfig[role]

  return (
    <Badge variant="secondary" className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}

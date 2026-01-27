'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { components } from '@/lib/api/types'

type TeamMemberRole = components['schemas']['TeamMemberRole']

interface MemberRoleBadgeProps {
  role: TeamMemberRole
}

const roleConfig: Record<TeamMemberRole, { labelKey: 'roleLead' | 'roleDeputy' | 'roleMember'; className: string }> = {
  lead: {
    labelKey: 'roleLead' as const,
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  deputy: {
    labelKey: 'roleDeputy' as const,
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  member: {
    labelKey: 'roleMember' as const,
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
}

/**
 * Badge component for displaying team member role.
 */
export function MemberRoleBadge({ role }: MemberRoleBadgeProps) {
  const t = useTranslations('adminTeams')
  const config = roleConfig[role]

  return (
    <Badge variant="secondary" className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}

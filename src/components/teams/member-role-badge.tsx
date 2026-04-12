'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import type { components } from '@/types/legacy-api-types'

type TeamMemberRole = components['schemas']['TeamMemberRole']

type BadgeVariant = 'blue' | 'purple' | 'gray'

interface MemberRoleBadgeProps {
  role: TeamMemberRole
}

const roleConfig: Record<TeamMemberRole, { labelKey: 'roleLead' | 'roleDeputy' | 'roleMember'; variant: BadgeVariant }> = {
  lead: {
    labelKey: 'roleLead' as const,
    variant: 'blue',
  },
  deputy: {
    labelKey: 'roleDeputy' as const,
    variant: 'purple',
  },
  member: {
    labelKey: 'roleMember' as const,
    variant: 'gray',
  },
}

/**
 * Badge component for displaying team member role.
 */
export function MemberRoleBadge({ role }: MemberRoleBadgeProps) {
  const t = useTranslations('adminTeams')
  const config = roleConfig[role]

  return (
    <Badge variant={config.variant}>
      {t(config.labelKey)}
    </Badge>
  )
}

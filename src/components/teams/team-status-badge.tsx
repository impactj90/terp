'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

interface TeamStatusBadgeProps {
  isActive: boolean
}

/**
 * Badge component for displaying team active/inactive status.
 */
export function TeamStatusBadge({ isActive }: TeamStatusBadgeProps) {
  const t = useTranslations('adminTeams')

  if (isActive) {
    return (
      <Badge variant="green">
        {t('statusActive')}
      </Badge>
    )
  }

  return (
    <Badge variant="gray">
      {t('statusInactive')}
    </Badge>
  )
}

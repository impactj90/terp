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
      <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
        {t('statusActive')}
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      {t('statusInactive')}
    </Badge>
  )
}

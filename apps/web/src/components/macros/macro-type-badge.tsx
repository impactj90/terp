'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/lib/api/types'

type Macro = components['schemas']['schema1']
type MacroType = Macro['macro_type']

interface MacroTypeBadgeProps {
  type: MacroType
}

const typeStyleConfig: Record<MacroType, string> = {
  weekly: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  monthly: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

export function MacroTypeBadge({ type }: MacroTypeBadgeProps) {
  const t = useTranslations('adminMacros')
  const labelKey = type === 'weekly' ? 'typeWeekly' : 'typeMonthly'
  return (
    <Badge variant="secondary" className={typeStyleConfig[type]}>
      {t(labelKey)}
    </Badge>
  )
}

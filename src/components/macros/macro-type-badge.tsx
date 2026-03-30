'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/types/legacy-api-types'

type Macro = components['schemas']['schema1']
type MacroType = Macro['macro_type']

type BadgeVariant = 'blue' | 'purple'

interface MacroTypeBadgeProps {
  type: MacroType
}

const typeVariants: Record<MacroType, BadgeVariant> = {
  weekly: 'blue',
  monthly: 'purple',
}

export function MacroTypeBadge({ type }: MacroTypeBadgeProps) {
  const t = useTranslations('adminMacros')
  const labelKey = type === 'weekly' ? 'typeWeekly' : 'typeMonthly'
  return (
    <Badge variant={typeVariants[type]}>
      {t(labelKey)}
    </Badge>
  )
}

'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/types/legacy-api-types'

type Macro = components['schemas']['schema1']
type ActionType = Macro['action_type']

type BadgeVariant = 'gray' | 'green' | 'amber' | 'cyan'

interface MacroActionBadgeProps {
  action: ActionType
}

const actionVariants: Record<ActionType, BadgeVariant> = {
  log_message: 'gray',
  recalculate_target_hours: 'green',
  reset_flextime: 'amber',
  carry_forward_balance: 'cyan',
}

const actionLabelMap: Record<ActionType, 'actionLogMessage' | 'actionRecalculateTargetHours' | 'actionResetFlextime' | 'actionCarryForwardBalance'> = {
  log_message: 'actionLogMessage',
  recalculate_target_hours: 'actionRecalculateTargetHours',
  reset_flextime: 'actionResetFlextime',
  carry_forward_balance: 'actionCarryForwardBalance',
}

export function MacroActionBadge({ action }: MacroActionBadgeProps) {
  const t = useTranslations('adminMacros')
  return (
    <Badge variant={actionVariants[action]}>
      {t(actionLabelMap[action])}
    </Badge>
  )
}

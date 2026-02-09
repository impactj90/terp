'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { components } from '@/lib/api/types'

type Macro = components['schemas']['schema1']
type ActionType = Macro['action_type']

interface MacroActionBadgeProps {
  action: ActionType
}

const actionStyleConfig: Record<ActionType, string> = {
  log_message: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  recalculate_target_hours: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  reset_flextime: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  carry_forward_balance: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
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
    <Badge variant="secondary" className={actionStyleConfig[action]}>
      {t(actionLabelMap[action])}
    </Badge>
  )
}

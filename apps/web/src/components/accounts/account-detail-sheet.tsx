'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { Edit, Trash2, Award, BarChart3, Scale, Lock, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAccount, useAccountUsage } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Account = components['schemas']['Account']

interface AccountDetailSheetProps {
  accountId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

function BooleanBadge({ value, trueLabel, falseLabel }: { value: boolean | undefined; trueLabel: string; falseLabel: string }) {
  return value ? (
    <Badge variant="default" className="text-xs">
      <Check className="mr-1 h-3 w-3" />
      {trueLabel}
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-xs">
      <X className="mr-1 h-3 w-3" />
      {falseLabel}
    </Badge>
  )
}

const accountTypeConfig: Record<string, {
  labelKey: string
  icon: React.ElementType
  variant: 'default' | 'secondary' | 'outline'
  color: string
}> = {
  bonus: { labelKey: 'typeBonus', icon: Award, variant: 'default', color: 'bg-amber-100' },
  tracking: { labelKey: 'typeTracking', icon: BarChart3, variant: 'secondary', color: 'bg-blue-100' },
  balance: { labelKey: 'typeBalance', icon: Scale, variant: 'outline', color: 'bg-green-100' },
}

const unitLabelKeys: Record<string, string> = {
  minutes: 'unitMinutes',
  hours: 'unitHours',
  days: 'unitDays',
}

export function AccountDetailSheet({
  accountId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: AccountDetailSheetProps) {
  const t = useTranslations('adminAccounts')
  const { data: account, isLoading } = useAccount(accountId || '', open && !!accountId)
  const { data: usageData } = useAccountUsage(accountId || '', open && !!accountId)

  const formatDateTime = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  const isSystem = account?.is_system ?? false

  // Get type info from runtime data
  const typeKey = (account as Record<string, unknown> | undefined)?.account_type as string || 'tracking'
  const typeInfo = accountTypeConfig[typeKey] ?? { labelKey: typeKey, icon: BarChart3, variant: 'secondary' as const, color: 'bg-muted' }
  const TypeIcon = typeInfo.icon

  // Unit from runtime (may not be in TS types)
  const unit = (account as Record<string, unknown> | undefined)?.unit as string | undefined
  const yearCarryover = (account as Record<string, unknown> | undefined)?.year_carryover as boolean | undefined
  const usagePlans = (usageData as { day_plans?: Array<{ id: string; code: string; name: string }> } | undefined)?.day_plans ?? []
  const usageCount = (usageData as { usage_count?: number } | undefined)?.usage_count ?? 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>{t('accountDetails')}</SheetTitle>
          <SheetDescription>{t('viewAccountInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-12 w-12" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : account ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon, name, and status */}
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-lg ${typeInfo.color}`}
                >
                  <TypeIcon className="h-6 w-6 text-foreground/70" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{account.name}</h3>
                    {isSystem && (
                      <Badge variant="outline" className="text-xs">
                        <Lock className="mr-1 h-3 w-3" />
                        {t('statusSystem')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground font-mono">
                    {account.code}
                  </p>
                </div>
                <Badge variant={account.is_active ? 'default' : 'secondary'}>
                  {account.is_active ? t('statusActive') : t('statusInactive')}
                </Badge>
              </div>

              {/* Description */}
              {account.description && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('fieldDescription')}</h4>
                  <p className="text-sm">{account.description}</p>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('detailsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldCode')} value={<span className="font-mono">{account.code}</span>} />
                  <DetailRow label={t('fieldName')} value={account.name} />
                  <DetailRow
                    label={t('fieldType')}
                    value={<Badge variant={typeInfo.variant}>{t(typeInfo.labelKey as Parameters<typeof t>[0])}</Badge>}
                  />
                </div>
              </div>

              {/* Configuration */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionConfiguration')}</h4>
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('fieldUnit')}</span>
                    <span className="text-sm font-medium">
                      {unit ? (unitLabelKeys[unit] ? t(unitLabelKeys[unit] as Parameters<typeof t>[0]) : unit) : t('notApplicable')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('fieldPayrollRelevant')}</span>
                    <BooleanBadge value={account.is_payroll_relevant} trueLabel={t('yes')} falseLabel={t('no')} />
                  </div>
                  <DetailRow label={t('fieldPayrollCode')} value={account.payroll_code} />
                  <DetailRow label={t('fieldSortOrder')} value={account.sort_order?.toString()} />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('fieldYearCarryover')}</span>
                    <BooleanBadge value={yearCarryover} trueLabel={t('yes')} falseLabel={t('no')} />
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('timestampsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDateTime(account.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDateTime(account.updated_at)} />
                </div>
              </div>

              {/* Usage */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('sectionUsage')}</h4>
                <div className="rounded-lg border p-4 space-y-3">
                  <DetailRow label={t('sectionUsage')} value={t('usageCount', { count: usageCount })} />
                  {usageCount === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('usageNone')}</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {usagePlans.map((plan) => (
                        <li key={plan.id} className="flex justify-between">
                          <span className="font-mono text-muted-foreground">{plan.code}</span>
                          <span className="text-right">{plan.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {account && (
            <>
              {isSystem ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" disabled>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('edit')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('systemCannotModify')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button variant="outline" onClick={() => onEdit(account)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t('edit')}
                </Button>
              )}
              {isSystem ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="destructive" disabled>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('delete')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('systemCannotDelete')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button variant="destructive" onClick={() => onDelete(account)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('delete')}
                </Button>
              )}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

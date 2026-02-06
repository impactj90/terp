'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Edit, Trash2, Calculator } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
import { useCalculationRule, useAccount } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type CalculationRule = components['schemas']['CalculationRule']

interface CalculationRuleDetailSheetProps {
  ruleId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (rule: CalculationRule) => void
  onDelete: (rule: CalculationRule) => void
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

export function CalculationRuleDetailSheet({
  ruleId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: CalculationRuleDetailSheetProps) {
  const t = useTranslations('adminCalculationRules')
  const { data: rule, isLoading } = useCalculationRule(ruleId || '', open && !!ruleId)
  const { data: account } = useAccount(rule?.account_id || '', open && !!rule?.account_id)

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('ruleDetails')}</SheetTitle>
          <SheetDescription>{t('viewRuleInfo')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : rule ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Header with icon and status */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Calculator className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{rule.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{rule.code}</p>
                </div>
                <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                  {rule.is_active ? t('statusActive') : t('statusInactive')}
                </Badge>
              </div>

              {/* Description */}
              {rule.description && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('fieldDescription')}</h4>
                  <p className="text-sm">{rule.description}</p>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('detailsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('fieldCode')} value={rule.code} />
                  <DetailRow label={t('fieldName')} value={rule.name} />
                </div>
              </div>

              {/* Calculation */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('calculationSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('columnValue')}
                    value={
                      rule.value === 0 ? (
                        <span className="text-muted-foreground">{t('valueDailyTarget')}</span>
                      ) : (
                        t('valueMinutes', { value: rule.value })
                      )
                    }
                  />
                  <DetailRow
                    label={t('columnFactor')}
                    value={`${rule.factor}x`}
                  />
                </div>
              </div>

              {/* Account */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('accountSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('fieldAccount')}
                    value={
                      account
                        ? `${account.code} - ${account.name}`
                        : rule.account_id
                          ? '...'
                          : t('accountNone')
                    }
                  />
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('timestampsSection')}</h4>
                <div className="rounded-lg border p-4">
                  <DetailRow label={t('labelCreated')} value={formatDate(rule.created_at)} />
                  <DetailRow label={t('labelLastUpdated')} value={formatDate(rule.updated_at)} />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('close')}
          </Button>
          {rule && (
            <>
              <Button variant="outline" onClick={() => onEdit(rule)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => onDelete(rule)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('delete')}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

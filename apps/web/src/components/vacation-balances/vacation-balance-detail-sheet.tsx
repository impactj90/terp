'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { Edit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { components } from '@/lib/api/types'

type VacationBalance = components['schemas']['VacationBalance']

interface VacationBalanceDetailSheetProps {
  balance: VacationBalance | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (balance: VacationBalance) => void
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

function getRemainingBadgeClass(remaining: number): string {
  if (remaining > 5) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
  if (remaining >= 1) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
  return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
}

function formatDecimal(value: number | undefined | null): string {
  return value?.toFixed(1) ?? '0.0'
}

export function VacationBalanceDetailSheet({
  balance,
  open,
  onOpenChange,
  onEdit,
}: VacationBalanceDetailSheetProps) {
  const t = useTranslations('adminVacationBalances')
  const tCommon = useTranslations('common')

  const formatDateTime = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy HH:mm')
  }

  const formatDate = (date: string | undefined | null) => {
    if (!date) return t('notSet')
    return format(new Date(date), 'dd.MM.yyyy')
  }

  const totalEntitlement = balance?.total_entitlement ?? 0
  const usedDays = balance?.used_days ?? 0
  const plannedDays = balance?.planned_days ?? 0
  const remaining = balance?.remaining_days ?? 0

  // Progress bar calculations
  const usedPercent = totalEntitlement > 0 ? (usedDays / totalEntitlement) * 100 : 0
  const plannedPercent = totalEntitlement > 0 ? (plannedDays / totalEntitlement) * 100 : 0

  const employeeName = balance
    ? `${balance.employee?.first_name ?? ''} ${balance.employee?.last_name ?? ''}`
    : ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {employeeName} - {balance?.year}
          </SheetTitle>
          <SheetDescription>{t('detailDescription')}</SheetDescription>
        </SheetHeader>

        {balance ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Entitlement Breakdown */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('sectionEntitlement')}
                </h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('labelBaseEntitlement')}
                    value={formatDecimal(balance.base_entitlement)}
                  />
                  <DetailRow
                    label={t('labelAdditionalEntitlement')}
                    value={formatDecimal(balance.additional_entitlement)}
                  />
                  <DetailRow
                    label={t('labelCarryoverFromPrevious')}
                    value={formatDecimal(balance.carryover_from_previous)}
                  />
                  <DetailRow
                    label={t('labelManualAdjustment')}
                    value={formatDecimal(balance.manual_adjustment)}
                  />
                  <DetailRow
                    label={t('labelTotalEntitlement')}
                    value={
                      <span className="font-bold">
                        {formatDecimal(balance.total_entitlement)}
                      </span>
                    }
                  />
                </div>
              </div>

              {/* Usage */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('sectionUsage')}
                </h4>
                <div className="rounded-lg border p-4 space-y-4">
                  {/* Progress bar */}
                  <div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                      <div className="flex h-full">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: usedPercent + '%' }}
                        />
                        <div
                          className="h-full bg-yellow-500 transition-all"
                          style={{ width: plannedPercent + '%' }}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        {t('columnUsedDays')}
                      </span>
                      {plannedDays > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-yellow-500" />
                          {t('columnPlannedDays')}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                        {t('columnRemainingDays')}
                      </span>
                    </div>
                  </div>

                  <DetailRow
                    label={t('labelUsedDays')}
                    value={formatDecimal(usedDays)}
                  />
                  <DetailRow
                    label={t('labelPlannedDays')}
                    value={formatDecimal(plannedDays)}
                  />
                  <DetailRow
                    label={t('labelRemainingDays')}
                    value={
                      <Badge variant="outline" className={getRemainingBadgeClass(remaining)}>
                        {formatDecimal(remaining)}
                      </Badge>
                    }
                  />
                </div>
              </div>

              {/* Carryover */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('sectionCarryover')}
                </h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('labelCarryoverToNext')}
                    value={
                      balance.carryover_to_next != null
                        ? formatDecimal(balance.carryover_to_next)
                        : t('notSet')
                    }
                  />
                  <DetailRow
                    label={t('labelCarryoverExpiresAt')}
                    value={formatDate(balance.carryover_expires_at)}
                  />
                </div>
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('sectionTimestamps')}
                </h4>
                <div className="rounded-lg border p-4">
                  <DetailRow
                    label={t('labelCreatedAt')}
                    value={formatDateTime(balance.created_at)}
                  />
                  <DetailRow
                    label={t('labelUpdatedAt')}
                    value={formatDateTime(balance.updated_at)}
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            {tCommon('close')}
          </Button>
          {balance && (
            <Button variant="outline" onClick={() => onEdit(balance)}>
              <Edit className="mr-2 h-4 w-4" />
              {t('editBalance')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

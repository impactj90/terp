'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { User, Lock, Unlock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TimeDisplay } from '@/components/timesheet'
import type { MonthlyValueRow } from './monthly-values-data-table'

interface MonthlyValuesDetailSheetProps {
  item: MonthlyValueRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onClose: (id: string) => void
  onReopen: (id: string) => void
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const statusConfig = {
    open: { labelKey: 'status.open', variant: 'outline' as const, className: '' },
    calculated: { labelKey: 'status.calculated', variant: 'secondary' as const, className: '' },
    closed: {
      labelKey: 'status.closed',
      variant: 'default' as const,
      className: 'bg-green-600 hover:bg-green-700',
    },
    exported: {
      labelKey: 'status.exported',
      variant: 'default' as const,
      className: 'bg-blue-600 hover:bg-blue-700',
    },
  }
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open
  return (
    <Badge variant={config.variant} className={config.className}>
      {t(config.labelKey)}
    </Badge>
  )
}

export function MonthlyValuesDetailSheet({
  item,
  open,
  onOpenChange,
  onClose,
  onReopen,
}: MonthlyValuesDetailSheetProps) {
  const t = useTranslations('monthlyValues')
  const locale = useLocale()
  const router = useRouter()

  const monthLabel = React.useMemo(() => {
    if (!item) return ''
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return formatter.format(new Date(item.year, item.month - 1, 1))
  }, [item, locale])

  const closedAtFormatted = React.useMemo(() => {
    if (!item?.closed_at) return '-'
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(item.closed_at))
    } catch {
      return item.closed_at
    }
  }, [item?.closed_at, locale])

  const handleGoToEmployee = () => {
    if (item) {
      router.push(`/admin/employees/${item.employee_id}`)
      onOpenChange(false)
    }
  }

  const canClose = item?.status === 'open' || item?.status === 'calculated'
  const canReopen = item?.status === 'closed'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {item ? `${item.employee_name} - ${monthLabel}` : t('detail.timeSummary')}
          </SheetTitle>
          <SheetDescription>
            {item?.personnel_number || ''}
          </SheetDescription>
        </SheetHeader>

        {item ? (
          <ScrollArea className="flex-1 -mx-4 px-4">
            <div className="space-y-6 py-4">
              {/* Time Summary */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.timeSummary')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.target')}</span>
                    <TimeDisplay value={item.target_minutes} format="duration" className="text-sm font-medium" />
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.net')}</span>
                    <TimeDisplay value={item.net_minutes} format="duration" className="text-sm font-medium" />
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.overtime')}</span>
                    <TimeDisplay value={item.overtime_minutes} format="duration" className="text-sm font-medium" />
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.balance')}</span>
                    <TimeDisplay value={item.balance_minutes} format="balance" className="text-sm font-medium" />
                  </div>
                </div>
              </div>

              {/* Work Days */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.workDays')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.workingDays')}</span>
                    <span className="text-sm font-medium">{item.working_days}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.workedDays')}</span>
                    <span className="text-sm font-medium">{item.worked_days}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.absenceDays')}</span>
                    <span className="text-sm font-medium">{item.absence_days}</span>
                  </div>
                </div>
              </div>

              {/* Closing Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.closingInfo')}
                </h4>
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.status')}</span>
                    {getStatusBadge(item.status, t as unknown as (key: string) => string)}
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.closedAt')}</span>
                    <span className="text-sm font-medium">{closedAtFormatted}</span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : null}

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('detail.close')}
          </Button>

          {canClose && (
            <Button
              variant="outline"
              onClick={() => item && onClose(item.id)}
              className="flex-1"
            >
              <Lock className="mr-2 h-4 w-4" />
              {t('detail.closeMonth')}
            </Button>
          )}

          {canReopen && (
            <Button
              variant="destructive"
              onClick={() => item && onReopen(item.id)}
              className="flex-1"
            >
              <Unlock className="mr-2 h-4 w-4" />
              {t('detail.reopenMonth')}
            </Button>
          )}

          <Button onClick={handleGoToEmployee} disabled={!item} className="flex-1">
            <User className="mr-2 h-4 w-4" />
            {t('detail.goToEmployee')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

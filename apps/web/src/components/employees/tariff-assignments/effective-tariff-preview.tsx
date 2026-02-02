'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { CalendarIcon, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useEffectiveTariff } from '@/hooks/api'

interface EffectiveTariffPreviewProps {
  employeeId: string
}

export function EffectiveTariffPreview({ employeeId }: EffectiveTariffPreviewProps) {
  const t = useTranslations('employeeTariffAssignments')
  const [date, setDate] = React.useState<Date>(new Date())
  const [month, setMonth] = React.useState<Date>(new Date())

  const dateStr = format(date, 'yyyy-MM-dd')
  const { data, isLoading } = useEffectiveTariff(employeeId, dateStr)

  const sourceLabel = data?.source
    ? t(`source${data.source.charAt(0).toUpperCase() + data.source.slice(1)}` as 'sourceAssignment' | 'sourceDefault' | 'sourceNone')
    : ''

  const sourceBadgeVariant = data?.source === 'assignment'
    ? 'default' as const
    : data?.source === 'default'
      ? 'secondary' as const
      : 'outline' as const

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold">{t('previewTitle')}</h4>
      </div>

      {/* Date picker */}
      <div className="space-y-2">
        <Label>{t('previewDateLabel')}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full sm:w-auto justify-start text-left font-normal',
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(date, 'dd.MM.yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              month={month}
              onMonthChange={setMonth}
              selected={date}
              onSelect={(d) => {
                if (d instanceof Date) {
                  setDate(d)
                }
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Result */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : data ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('previewTariffLabel')}:</span>
            {data.tariff ? (
              <span className="text-sm font-medium">
                {data.tariff.code} - {data.tariff.name}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground italic">
                {t('previewNoTariff')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('previewSourceLabel')}:</span>
            <Badge variant={sourceBadgeVariant} className="text-xs">
              {sourceLabel}
            </Badge>
          </div>

          {data.assignment && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('previewDateRange')}:</span>
              <span className="text-sm">
                {format(new Date(data.assignment.effective_from), 'dd.MM.yyyy')} -{' '}
                {data.assignment.effective_to
                  ? format(new Date(data.assignment.effective_to), 'dd.MM.yyyy')
                  : t('openEnded')
                }
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

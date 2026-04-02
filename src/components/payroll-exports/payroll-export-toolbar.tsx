'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PayrollExportToolbarProps {
  year: number
  month: number
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
  status: string
  onStatusChange: (status: string) => void
  onGenerate: () => void
}

export function PayrollExportToolbar({
  year,
  month,
  onYearChange,
  onMonthChange,
  status,
  onStatusChange,
  onGenerate,
}: PayrollExportToolbarProps) {
  const t = useTranslations('payrollExports')
  const tc = useTranslations('common')
  const locale = useLocale()

  const monthLabel = React.useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    return formatter.format(new Date(year, month - 1, 1))
  }, [year, month, locale])

  const navigatePrevious = () => {
    if (month === 1) {
      onMonthChange(12)
      onYearChange(year - 1)
    } else {
      onMonthChange(month - 1)
    }
  }

  const navigateNext = () => {
    if (month === 12) {
      onMonthChange(1)
      onYearChange(year + 1)
    } else {
      onMonthChange(month + 1)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-4 md:items-end">
      {/* Month/Year navigator */}
      <div className="flex items-center rounded-md border">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={navigatePrevious} className="h-9 w-9">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tc('previousMonth')}</TooltipContent>
        </Tooltip>
        <span className="flex-1 px-3 text-sm font-medium text-center capitalize">
          {monthLabel}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={navigateNext} className="h-9 w-9">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tc('nextMonth')}</TooltipContent>
        </Tooltip>
      </div>

      {/* Status filter */}
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger>
          <SelectValue placeholder={t('toolbar.allStatuses')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('toolbar.allStatuses')}</SelectItem>
          <SelectItem value="pending">{t('status.pending')}</SelectItem>
          <SelectItem value="generating">{t('status.generating')}</SelectItem>
          <SelectItem value="completed">{t('status.completed')}</SelectItem>
          <SelectItem value="failed">{t('status.failed')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Spacer */}
      <div />

      {/* Generate button */}
      <Button onClick={onGenerate}>
        <Plus className="mr-2 h-4 w-4" />
        {t('toolbar.generateExport')}
      </Button>
    </div>
  )
}

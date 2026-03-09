'use client'

import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ReportToolbarProps {
  reportType: string
  onReportTypeChange: (v: string) => void
  status: string
  onStatusChange: (v: string) => void
  onGenerate: () => void
}

export function ReportToolbar({
  reportType,
  onReportTypeChange,
  status,
  onStatusChange,
  onGenerate,
}: ReportToolbarProps) {
  const t = useTranslations('reports')

  return (
    <div className="grid gap-4 md:grid-cols-4 md:items-end">
      {/* Report type filter */}
      <Select value={reportType} onValueChange={onReportTypeChange}>
        <SelectTrigger>
          <SelectValue placeholder={t('toolbar.allTypes')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('toolbar.allTypes')}</SelectItem>
          <SelectItem value="daily_overview">{t('types.daily_overview')}</SelectItem>
          <SelectItem value="weekly_overview">{t('types.weekly_overview')}</SelectItem>
          <SelectItem value="monthly_overview">{t('types.monthly_overview')}</SelectItem>
          <SelectItem value="employee_timesheet">{t('types.employee_timesheet')}</SelectItem>
          <SelectItem value="department_summary">{t('types.department_summary')}</SelectItem>
          <SelectItem value="absence_report">{t('types.absence_report')}</SelectItem>
          <SelectItem value="vacation_report">{t('types.vacation_report')}</SelectItem>
          <SelectItem value="overtime_report">{t('types.overtime_report')}</SelectItem>
          <SelectItem value="account_balances">{t('types.account_balances')}</SelectItem>
          <SelectItem value="custom">{t('types.custom')}</SelectItem>
        </SelectContent>
      </Select>

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
        {t('toolbar.generateReport')}
      </Button>
    </div>
  )
}

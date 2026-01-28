'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMinutes } from '@/lib/time-utils'
import type { TeamDailyValuesResult } from '@/hooks/api/use-team-daily-values'
import type { components } from '@/lib/api/types'

type TeamMember = components['schemas']['TeamMember']

interface TeamExportButtonsProps {
  members: TeamMember[]
  rangeDailyValues: TeamDailyValuesResult[]
  rangeFrom: string
  rangeTo: string
  isLoading?: boolean
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export function TeamExportButtons({
  members,
  rangeDailyValues,
  rangeFrom,
  rangeTo,
  isLoading = false,
}: TeamExportButtonsProps) {
  const t = useTranslations('teamOverview')
  const [isExporting, setIsExporting] = useState(false)

  const memberValues = new Map(
    rangeDailyValues.map((result) => [result.employeeId, result.values])
  )

  const hasData = members.length > 0 && rangeDailyValues.length > 0

  const handleExport = () => {
    if (!hasData) return
    setIsExporting(true)

    try {
      const headers = [
        t('member'),
        t('totalNet'),
        t('totalTarget'),
        t('totalOvertime'),
        t('totalUndertime'),
        t('absenceDays'),
      ]

      const rows = members.map((member) => {
        const values = memberValues.get(member.employee_id) ?? []
        let totalNetMinutes = 0
        let totalTargetMinutes = 0
        let totalOvertimeMinutes = 0
        let totalUndertimeMinutes = 0
        let absenceDays = 0

        for (const dv of values) {
          totalNetMinutes += dv.net_minutes ?? 0
          totalTargetMinutes += dv.target_minutes ?? 0
          totalOvertimeMinutes += dv.overtime_minutes ?? 0
          totalUndertimeMinutes += dv.undertime_minutes ?? 0
          if (dv.is_absence) {
            absenceDays += 1
          }
        }

        const firstName = member.employee?.first_name ?? ''
        const lastName = member.employee?.last_name ?? ''
        const name = member.employee
          ? `${firstName} ${lastName}`.trim()
          : t('unknownEmployee')

        return [
          escapeCsv(name),
          escapeCsv(formatMinutes(totalNetMinutes)),
          escapeCsv(formatMinutes(totalTargetMinutes)),
          escapeCsv(formatMinutes(totalOvertimeMinutes)),
          escapeCsv(formatMinutes(totalUndertimeMinutes)),
          escapeCsv(String(absenceDays)),
        ].join(',')
      })

      const csv = [headers.map(escapeCsv).join(','), ...rows].join('\n')
      const filename = `team-report-${rangeFrom}-to-${rangeTo}.csv`
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isLoading || isExporting || !hasData}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      {t('exportTeamReport')}
    </Button>
  )
}

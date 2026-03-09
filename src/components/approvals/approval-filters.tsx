'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface ApprovalFiltersProps {
  teams: Array<{ id: string; name: string }>
  selectedTeamId: string | null
  onTeamChange: (teamId: string | null) => void
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  statusOptions: Array<{ value: string; label: string }>
  status: string
  onStatusChange: (status: string) => void
  isLoadingTeams?: boolean
  className?: string
}

export function ApprovalFilters({
  teams,
  selectedTeamId,
  onTeamChange,
  dateRange,
  onDateRangeChange,
  statusOptions,
  status,
  onStatusChange,
  isLoadingTeams = false,
  className,
}: ApprovalFiltersProps) {
  const t = useTranslations('adminApprovals')

  return (
    <div
      className={cn(
        'grid gap-4 md:grid-cols-3 md:items-end',
        className
      )}
    >
      <div className="space-y-2">
        <Label>{t('filterTeam')}</Label>
        <Select
          value={selectedTeamId ?? 'all'}
          onValueChange={(value) =>
            onTeamChange(value === 'all' ? null : value)
          }
          disabled={isLoadingTeams}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('filterAllTeams')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filterAllTeams')}</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{t('filterDateRange')}</Label>
        <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
      </div>

      <div className="space-y-2">
        <Label>{t('filterStatus')}</Label>
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger>
            <SelectValue placeholder={t('filterAllStatuses')} />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

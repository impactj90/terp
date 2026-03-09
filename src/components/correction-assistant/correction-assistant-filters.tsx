'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface CorrectionAssistantFiltersProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  departments: Array<{ id: string; name: string }>
  selectedDepartmentId: string | null
  onDepartmentChange: (id: string | null) => void
  severity: string
  onSeverityChange: (severity: string) => void
  errorCode: string
  onErrorCodeChange: (code: string) => void
  employeeSearch: string
  onEmployeeSearchChange: (search: string) => void
  isLoadingDepartments?: boolean
  onClearFilters: () => void
  hasFilters: boolean
}

export function CorrectionAssistantFilters({
  dateRange,
  onDateRangeChange,
  departments,
  selectedDepartmentId,
  onDepartmentChange,
  severity,
  onSeverityChange,
  errorCode,
  onErrorCodeChange,
  employeeSearch,
  onEmployeeSearchChange,
  isLoadingDepartments = false,
  onClearFilters,
  hasFilters,
}: CorrectionAssistantFiltersProps) {
  const t = useTranslations('correctionAssistant')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 md:items-end">
        <div className="space-y-2">
          <Label>{t('filters.dateRange')}</Label>
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        </div>

        <div className="space-y-2">
          <Label>{t('filters.department')}</Label>
          <Select
            value={selectedDepartmentId ?? 'all'}
            onValueChange={(value) =>
              onDepartmentChange(value === 'all' ? null : value)
            }
            disabled={isLoadingDepartments}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allDepartments')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allDepartments')}</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('filters.severity')}</Label>
          <Select value={severity} onValueChange={onSeverityChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allSeverities')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allSeverities')}</SelectItem>
              <SelectItem value="error">{t('filters.error')}</SelectItem>
              <SelectItem value="hint">{t('filters.hint')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('filters.errorCode')}</Label>
          <Input
            placeholder={t('filters.errorCodePlaceholder')}
            value={errorCode}
            onChange={(e) => onErrorCodeChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-end gap-4">
        <div className="space-y-2">
          <Label>{t('filters.employeeSearch')}</Label>
          <Input
            placeholder={t('filters.employeeSearchPlaceholder')}
            value={employeeSearch}
            onChange={(e) => onEmployeeSearchChange(e.target.value)}
            className="w-64"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" onClick={onClearFilters} size="sm">
            <X className="mr-2 h-4 w-4" />
            {t('filters.clearFilters')}
          </Button>
        )}
      </div>
    </div>
  )
}

'use client'

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
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface EvaluationsSharedFiltersProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  employeeId: string | null
  onEmployeeChange: (id: string | null) => void
  departmentId: string | null
  onDepartmentChange: (id: string | null) => void
  employees: Array<{ id: string; name: string }>
  departments: Array<{ id: string; name: string }>
  isLoadingEmployees?: boolean
  isLoadingDepartments?: boolean
  onClearFilters: () => void
  hasFilters: boolean
}

export function EvaluationsSharedFilters({
  dateRange,
  onDateRangeChange,
  employeeId,
  onEmployeeChange,
  departmentId,
  onDepartmentChange,
  employees,
  departments,
  isLoadingEmployees = false,
  isLoadingDepartments = false,
  onClearFilters,
  hasFilters,
}: EvaluationsSharedFiltersProps) {
  const t = useTranslations('evaluations')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 md:items-end">
        <div className="space-y-2">
          <Label>{t('filters.dateRange')}</Label>
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        </div>

        <div className="space-y-2">
          <Label>{t('filters.employee')}</Label>
          <Select
            value={employeeId ?? 'all'}
            onValueChange={(value) =>
              onEmployeeChange(value === 'all' ? null : value)
            }
            disabled={isLoadingEmployees}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allEmployees')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allEmployees')}</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('filters.department')}</Label>
          <Select
            value={departmentId ?? 'all'}
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

        {hasFilters && (
          <div className="flex items-end">
            <Button variant="ghost" onClick={onClearFilters} size="sm">
              <X className="mr-2 h-4 w-4" />
              {t('filters.clearFilters')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

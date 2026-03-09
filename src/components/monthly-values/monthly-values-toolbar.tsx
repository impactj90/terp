'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft, ChevronRight, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface MonthlyValuesToolbarProps {
  year: number
  month: number
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
  departmentId: string | null
  onDepartmentChange: (id: string | null) => void
  departments: Array<{ id: string; name: string }>
  isLoadingDepartments: boolean
  status: string
  onStatusChange: (status: string) => void
  search: string
  onSearchChange: (search: string) => void
  onClearFilters: () => void
  hasFilters: boolean
}

export function MonthlyValuesToolbar({
  year,
  month,
  onYearChange,
  onMonthChange,
  departmentId,
  onDepartmentChange,
  departments,
  isLoadingDepartments,
  status,
  onStatusChange,
  search,
  onSearchChange,
  onClearFilters,
  hasFilters,
}: MonthlyValuesToolbarProps) {
  const t = useTranslations('monthlyValues')
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
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4 md:items-end">
        {/* Month/Year navigator */}
        <div className="flex items-center rounded-md border">
          <Button variant="ghost" size="icon" onClick={navigatePrevious} className="h-9 w-9">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="flex-1 px-3 text-sm font-medium text-center capitalize">
            {monthLabel}
          </span>
          <Button variant="ghost" size="icon" onClick={navigateNext} className="h-9 w-9">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Department filter */}
        <Select
          value={departmentId ?? 'all'}
          onValueChange={(value) => onDepartmentChange(value === 'all' ? null : value)}
          disabled={isLoadingDepartments}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('toolbar.allDepartments')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('toolbar.allDepartments')}</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger>
            <SelectValue placeholder={t('toolbar.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('toolbar.allStatuses')}</SelectItem>
            <SelectItem value="open">{t('status.open')}</SelectItem>
            <SelectItem value="calculated">{t('status.calculated')}</SelectItem>
            <SelectItem value="closed">{t('status.closed')}</SelectItem>
            <SelectItem value="exported">{t('status.exported')}</SelectItem>
          </SelectContent>
        </Select>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('toolbar.searchPlaceholder')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {hasFilters && (
        <div className="flex items-center">
          <Button variant="ghost" onClick={onClearFilters} size="sm">
            <X className="mr-2 h-4 w-4" />
            {t('toolbar.clearFilters')}
          </Button>
        </div>
      )}
    </div>
  )
}

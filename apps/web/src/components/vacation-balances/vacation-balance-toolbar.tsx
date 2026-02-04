'use client'

import { useTranslations } from 'next-intl'
import { CalendarPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface VacationBalanceToolbarProps {
  year: number
  onYearChange: (year: number) => void
  departmentId: string | undefined
  onDepartmentChange: (id: string | undefined) => void
  departments: Array<{ id: string; name: string }>
  search: string
  onSearchChange: (search: string) => void
  onInitializeYear: () => void
  onCreateBalance: () => void
}

export function VacationBalanceToolbar({
  year,
  onYearChange,
  departmentId,
  onDepartmentChange,
  departments,
  search,
  onSearchChange,
  onInitializeYear,
  onCreateBalance,
}: VacationBalanceToolbarProps) {
  const t = useTranslations('adminVacationBalances')

  const currentYear = new Date().getFullYear()
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Year selector */}
      <Select
        value={String(year)}
        onValueChange={(val) => onYearChange(parseInt(val))}
      >
        <SelectTrigger className="w-32 h-9">
          <SelectValue placeholder={t('yearLabel')} />
        </SelectTrigger>
        <SelectContent>
          {yearOptions.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={t('searchPlaceholder')}
        className="w-56"
      />

      {/* Department filter */}
      <Select
        value={departmentId ?? 'all'}
        onValueChange={(val) =>
          onDepartmentChange(val === 'all' ? undefined : val)
        }
      >
        <SelectTrigger className="w-44 h-9">
          <SelectValue placeholder={t('allDepartments')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allDepartments')}</SelectItem>
          {departments.map((dept) => (
            <SelectItem key={dept.id} value={dept.id}>
              {dept.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Initialize Year button */}
      <Button variant="outline" size="sm" onClick={onInitializeYear} className="h-9">
        <CalendarPlus className="mr-1.5 h-4 w-4" />
        {t('initializeYearButton')}
      </Button>

      {/* Create Balance button */}
      <Button size="sm" onClick={onCreateBalance} className="h-9">
        <Plus className="mr-1.5 h-4 w-4" />
        {t('newBalance')}
      </Button>
    </div>
  )
}

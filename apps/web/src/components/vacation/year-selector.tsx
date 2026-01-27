'use client'

import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface YearSelectorProps {
  value: number
  onChange: (year: number) => void
  /** Years to show before and after current year */
  range?: number
  className?: string
}

/**
 * Year selector dropdown for vacation/timesheet views.
 */
export function YearSelector({
  value,
  onChange,
  range = 5,
  className,
}: YearSelectorProps) {
  const t = useTranslations('vacation')
  const currentYear = new Date().getFullYear()

  // Generate year options: current year +/- range
  const years: number[] = []
  for (let y = currentYear - range; y <= currentYear + 1; y++) {
    years.push(y)
  }

  return (
    <Select
      value={value.toString()}
      onValueChange={(v) => onChange(parseInt(v, 10))}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={t('selectYear')} />
      </SelectTrigger>
      <SelectContent>
        {years.map((year) => (
          <SelectItem key={year} value={year.toString()}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

'use client'

import * as React from 'react'
import { CalendarIcon, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar, type DateRange } from '@/components/ui/calendar'

interface DateRangePickerProps {
  /** Selected date range */
  value?: DateRange
  /** Selection callback */
  onChange?: (range: DateRange | undefined) => void
  /** Placeholder text */
  placeholder?: string
  /** Disabled state */
  disabled?: boolean
  /** Dates to highlight as holidays */
  holidays?: Date[]
  /** Dates to highlight as absences */
  absences?: Date[]
  /** Earliest selectable date */
  minDate?: Date
  /** Latest selectable date */
  maxDate?: Date
  /** Additional className */
  className?: string
}

function formatDateRange(range: DateRange, locale: string): string {
  if (!range.from) return ''

  const formatOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  }

  const fromStr = range.from.toLocaleDateString(locale, formatOptions)

  if (!range.to) {
    return fromStr
  }

  const toStr = range.to.toLocaleDateString(locale, {
    ...formatOptions,
    year: 'numeric',
  })

  // If same year, don't repeat year on from date
  if (range.from.getFullYear() === range.to.getFullYear()) {
    return `${fromStr} - ${toStr}`
  }

  const fromStrWithYear = range.from.toLocaleDateString(locale, {
    ...formatOptions,
    year: 'numeric',
  })
  return `${fromStrWithYear} - ${toStr}`
}

export function DateRangePicker({
  value,
  onChange,
  placeholder,
  disabled = false,
  holidays = [],
  absences = [],
  minDate,
  maxDate,
  className,
}: DateRangePickerProps) {
  const locale = useLocale()
  const t = useTranslations('common')
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() => value?.from ?? new Date())

  const effectivePlaceholder = placeholder ?? t('selectDateRange')

  // Update month when value changes externally
  React.useEffect(() => {
    if (value?.from) {
      setMonth(value.from)
    }
  }, [value?.from])

  const handleSelect = (newValue: Date | DateRange | undefined) => {
    const range = newValue as DateRange | undefined
    onChange?.(range)

    // Close popover when range is complete
    if (range?.from && range?.to) {
      setOpen(false)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.(undefined)
  }

  const hasValue = value?.from !== undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !hasValue && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {hasValue ? formatDateRange(value!, locale) : effectivePlaceholder}
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleClear(e as unknown as React.MouseEvent)
                }
              }}
              className="ml-auto rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">{t('clear')}</span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          month={month}
          onMonthChange={setMonth}
          selected={value}
          onSelect={handleSelect}
          holidays={holidays}
          absences={absences}
          minDate={minDate}
          maxDate={maxDate}
        />
        {value?.from && !value?.to && (
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            {t('clickToCompleteRange')}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

export type { DateRange }

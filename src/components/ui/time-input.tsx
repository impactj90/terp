'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TimeInputProps {
  /** Value in minutes from midnight (0-1440) */
  value: number | null | undefined
  /** Callback when value changes */
  onChange: (minutes: number | null) => void
  /** Placeholder text */
  placeholder?: string
  /** Whether the input is disabled */
  disabled?: boolean
  /** Additional class names */
  className?: string
  /** Input ID for labels */
  id?: string
}

/**
 * Convert minutes from midnight to HH:MM string.
 */
function minutesToTimeString(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Parse HH:MM string to minutes from midnight.
 */
function timeStringToMinutes(time: string): number | null {
  if (!time || !time.includes(':')) return null
  const [hoursStr, minsStr] = time.split(':')
  const hours = parseInt(hoursStr ?? '0', 10)
  const mins = parseInt(minsStr ?? '0', 10)
  if (isNaN(hours) || isNaN(mins)) return null
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null
  return hours * 60 + mins
}

/**
 * Time input component for minutes-from-midnight values.
 * Displays and accepts HH:MM format.
 */
export function TimeInput({
  value,
  onChange,
  placeholder = 'HH:MM',
  disabled,
  className,
  id,
}: TimeInputProps) {
  const [inputValue, setInputValue] = React.useState(() => minutesToTimeString(value))

  // Sync input value when prop changes externally
  React.useEffect(() => {
    setInputValue(minutesToTimeString(value))
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
  }

  const handleBlur = () => {
    const minutes = timeStringToMinutes(inputValue)
    if (minutes !== null) {
      onChange(minutes)
      setInputValue(minutesToTimeString(minutes))
    } else if (inputValue === '') {
      onChange(null)
    } else {
      // Reset to previous valid value
      setInputValue(minutesToTimeString(value))
    }
  }

  return (
    <Input
      id={id}
      type="time"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={cn('w-[120px]', className)}
    />
  )
}

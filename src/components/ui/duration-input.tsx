'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface DurationInputProps {
  /** Value in minutes */
  value: number | null | undefined
  /** Callback when value changes */
  onChange: (minutes: number | null) => void
  /** Display format */
  format?: 'minutes' | 'hours' | 'hhmm'
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
 * Duration input component for minute values.
 * Can display as minutes, hours (decimal), or HH:MM format.
 */
export function DurationInput({
  value,
  onChange,
  format = 'minutes',
  placeholder,
  disabled,
  className,
  id,
}: DurationInputProps) {
  const formatValue = React.useCallback((minutes: number | null | undefined): string => {
    if (minutes === null || minutes === undefined) return ''
    switch (format) {
      case 'hours':
        return (minutes / 60).toFixed(2)
      case 'hhmm': {
        const h = Math.floor(minutes / 60)
        const m = minutes % 60
        return `${h}:${m.toString().padStart(2, '0')}`
      }
      default:
        return minutes.toString()
    }
  }, [format])

  const parseValue = React.useCallback((input: string): number | null => {
    if (!input) return null
    switch (format) {
      case 'hours': {
        const hours = parseFloat(input)
        if (isNaN(hours)) return null
        return Math.round(hours * 60)
      }
      case 'hhmm': {
        if (!input.includes(':')) return null
        const parts = input.split(':').map(Number)
        const h = parts[0]
        const m = parts[1]
        if (h === undefined || m === undefined || isNaN(h) || isNaN(m)) return null
        return h * 60 + m
      }
      default: {
        const mins = parseInt(input, 10)
        if (isNaN(mins)) return null
        return mins
      }
    }
  }, [format])

  const [inputValue, setInputValue] = React.useState(() => formatValue(value))

  React.useEffect(() => {
    setInputValue(formatValue(value))
  }, [value, formatValue])

  const handleBlur = () => {
    const minutes = parseValue(inputValue)
    if (minutes !== null) {
      onChange(minutes)
      setInputValue(formatValue(minutes))
    } else if (inputValue === '') {
      onChange(null)
    } else {
      setInputValue(formatValue(value))
    }
  }

  const defaultPlaceholder = format === 'hours' ? '8.00' : format === 'hhmm' ? '8:00' : '480'

  return (
    <Input
      id={id}
      type={format === 'minutes' ? 'number' : 'text'}
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder ?? defaultPlaceholder}
      disabled={disabled}
      className={cn('w-[100px]', className)}
    />
  )
}

'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './input'
import { Button } from './button'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
  disabled?: boolean
}

/**
 * Debounced search input with search icon and clear button.
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState('')
 * <SearchInput
 *   value={search}
 *   onChange={setSearch}
 *   placeholder="Search employees..."
 *   debounceMs={300}
 * />
 * ```
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
  disabled = false,
}: SearchInputProps) {
  const [localValue, setLocalValue] = React.useState(value)
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  // Sync external value changes
  React.useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Debounced onChange
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setLocalValue(newValue)

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      onChange(newValue)
    }, debounceMs)
  }

  // Clear on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleClear = () => {
    setLocalValue('')
    onChange('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Submit immediately on Enter
    if (e.key === 'Enter') {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      onChange(localValue)
    }
    // Clear on Escape
    if (e.key === 'Escape') {
      handleClear()
    }
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="pl-9 pr-9"
      />
      {localValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={handleClear}
          disabled={disabled}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Clear search</span>
        </Button>
      )}
    </div>
  )
}

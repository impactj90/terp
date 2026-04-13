'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  ISO_COUNTRY_CODES,
  getCountryName,
  isValidCountryCode,
} from '@/lib/iso-countries'

interface CountryOption {
  code: string
  name: string
  searchKey: string
}

interface CountryComboboxProps {
  value: string | null
  onChange: (code: string | null) => void
  id?: string
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  clearLabel?: string
  disabled?: boolean
  allowClear?: boolean
  /** BCP-47 locale for country names (default: 'de') */
  locale?: string
  className?: string
}

/**
 * Searchable country picker built from Popover + Input + a filtered
 * button list. Only accepts ISO 3166-1 alpha-2 codes — invalid values
 * are displayed as-is but cannot be selected.
 */
export function CountryCombobox({
  value,
  onChange,
  id,
  placeholder = 'Land wählen...',
  searchPlaceholder = 'Land suchen...',
  emptyLabel = 'Kein Treffer',
  clearLabel = 'Auswahl entfernen',
  disabled,
  allowClear = true,
  locale = 'de',
  className,
}: CountryComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const options = React.useMemo<CountryOption[]>(() => {
    return ISO_COUNTRY_CODES.map((code) => {
      const name = getCountryName(code, locale)
      return {
        code,
        name,
        searchKey: `${code} ${name}`.toLowerCase(),
      }
    }).sort((a, b) => a.name.localeCompare(b.name, locale))
  }, [locale])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.searchKey.includes(q))
  }, [options, search])

  const selectedLabel = React.useMemo(() => {
    if (!value) return null
    if (isValidCountryCode(value)) {
      return `${getCountryName(value, locale)} (${value.toUpperCase()})`
    }
    return value
  }, [value, locale])

  const isInvalid = !!value && !isValidCountryCode(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={isInvalid || undefined}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            isInvalid && 'border-destructive text-destructive',
            className,
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2">
          <Input
            autoFocus
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-60 overflow-y-auto px-1 pb-1">
          {allowClear && value && (
            <button
              type="button"
              className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onChange(null)
                setOpen(false)
                setSearch('')
              }}
            >
              <X className="mr-2 h-4 w-4" />
              {clearLabel}
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </p>
          ) : (
            filtered.map((opt) => {
              const isSelected = value?.toUpperCase() === opt.code
              return (
                <button
                  key={opt.code}
                  type="button"
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                    isSelected && 'bg-accent text-accent-foreground',
                  )}
                  onClick={() => {
                    onChange(opt.code)
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      isSelected ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="flex-1 truncate">{opt.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{opt.code}</span>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

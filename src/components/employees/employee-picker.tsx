'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useEmployees, useEmployee } from '@/hooks/use-employees'

interface Props {
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  clearLabel?: string
  disabled?: boolean
  allowClear?: boolean
  /** Scope the list to active employees only (default true). */
  activeOnly?: boolean
  id?: string
}

export function EmployeePicker({
  value,
  onChange,
  placeholder = 'Mitarbeiter wählen…',
  searchPlaceholder = 'Name, Personalnummer…',
  emptyLabel = 'Kein Treffer',
  clearLabel = 'Auswahl entfernen',
  disabled,
  allowClear = true,
  activeOnly = true,
  id,
}: Props) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  // Only fetch while the popover is open.
  const listQuery = useEmployees({
    enabled: open,
    isActive: activeOnly ? true : undefined,
    search: search.trim() || undefined,
    pageSize: 50,
  })

  const items = (
    listQuery.data?.items as
      | Array<{
          id: string
          firstName: string
          lastName: string
          personnelNumber: string
        }>
      | undefined
  ) ?? []

  // Resolve the currently-selected employee for the trigger label so it
  // still renders correctly when the selected employee isn't in the
  // current paginated search result.
  const selectedQuery = useEmployee(value ?? '', !!value)
  const selected = selectedQuery.data as
    | { id: string; firstName: string; lastName: string; personnelNumber: string }
    | undefined

  const selectedLabel =
    selected && selected.id === value
      ? `${selected.firstName} ${selected.lastName} (${selected.personnelNumber})`
      : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">
            {selectedLabel ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
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
          {listQuery.isLoading ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              …
            </p>
          ) : items.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </p>
          ) : (
            items.map((opt) => {
              const isSelected = value === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                    isSelected && 'bg-accent text-accent-foreground',
                  )}
                  onClick={() => {
                    onChange(opt.id)
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
                  <span className="flex-1 truncate">
                    <span>{opt.firstName} {opt.lastName}</span>{' '}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({opt.personnelNumber})
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

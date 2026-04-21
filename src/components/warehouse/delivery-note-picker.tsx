'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useBillingDocuments, useBillingDocumentById } from '@/hooks/use-billing-documents'

interface DeliveryNotePickerProps {
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  clearLabel?: string
  disabled?: boolean
  id?: string
}

type DeliveryNoteItem = {
  id: string
  documentNumber: string | null
  subject: string | null
  documentDate: string | Date | null
}

/**
 * Combobox-style picker for delivery notes (Lieferscheine).
 * Mirrors the ServiceObjectPicker UX: click to open, default list visible,
 * type to filter, click to select.
 */
export function DeliveryNotePicker({
  value,
  onChange,
  placeholder = 'Lieferschein wählen…',
  searchPlaceholder = 'Nummer oder Betreff…',
  emptyLabel = 'Kein Treffer',
  clearLabel = 'Auswahl entfernen',
  disabled,
  id,
}: DeliveryNotePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const { data, isLoading } = useBillingDocuments({
    type: 'DELIVERY_NOTE',
    search: search.trim() || undefined,
    pageSize: 50,
    enabled: open,
  })

  const items =
    ((data as unknown as { items?: DeliveryNoteItem[] } | undefined)?.items as
      | DeliveryNoteItem[]
      | undefined) ?? []

  // Resolve selected document separately so the trigger keeps its label even
  // when the search list is filtered or closed.
  const selectedQuery = useBillingDocumentById(value ?? '', !!value)
  const selected = selectedQuery.data as DeliveryNoteItem | undefined

  const formatLabel = (d: DeliveryNoteItem) =>
    `${d.documentNumber ?? '—'}${d.subject ? ` — ${d.subject}` : ''}`

  const selectedLabel =
    selected && selected.id === value ? formatLabel(selected) : null

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
          <span className="truncate">{selectedLabel ?? placeholder}</span>
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
          {value && (
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
          {isLoading ? (
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
                    <span className="font-mono text-xs text-muted-foreground">
                      {opt.documentNumber ?? '—'}
                    </span>
                    {opt.subject ? (
                      <span className="ml-2">{opt.subject}</span>
                    ) : null}
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

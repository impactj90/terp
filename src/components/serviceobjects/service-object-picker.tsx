'use client'

import * as React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useServiceObjects } from '@/hooks/use-service-objects'

interface Props {
  value: string | null
  onChange: (id: string | null) => void
  customerAddressId?: string
  placeholder?: string
  disabled?: boolean
}

export function ServiceObjectPicker({
  value,
  onChange,
  customerAddressId,
  placeholder = 'Serviceobjekt wählen',
  disabled,
}: Props) {
  const [search, setSearch] = React.useState('')
  const { data, isLoading } = useServiceObjects({
    customerAddressId,
    isActive: true,
    search: search || undefined,
    pageSize: 50,
  })

  return (
    <div className="space-y-2">
      <Input
        placeholder="Suche (Nummer, Name, Seriennummer…)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled}
      />
      <Select
        value={value ?? ''}
        onValueChange={(v) => onChange(v || null)}
        disabled={disabled || isLoading}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {(data?.items ?? []).map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.number} — {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

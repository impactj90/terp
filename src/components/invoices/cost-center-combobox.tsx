"use client"

import * as React from "react"
import { useCostCenters } from "@/hooks/use-cost-centers"
import { Input } from "@/components/ui/input"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CostCenterComboboxProps {
  value: string | null
  onChange: (costCenterId: string | null) => void
}

export function CostCenterCombobox({ value, onChange }: CostCenterComboboxProps) {
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const { data } = useCostCenters({ isActive: true })
  const costCenters = data?.data ?? []

  const selected = costCenters.find((c) => c.id === value)
  const filtered = costCenters.filter((c) =>
    !query || c.code.toLowerCase().includes(query.toLowerCase())
           || c.name.toLowerCase().includes(query.toLowerCase())
  )

  // Close on outside click
  React.useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [])

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1">
        <Input
          value={selected ? `${selected.code} — ${selected.name}` : query}
          onChange={(e) => {
            if (selected) onChange(null)
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Kostenstelle suchen..."
          className="text-sm"
        />
        {value && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
            onClick={() => { onChange(null); setQuery("") }}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Keine Kostenstellen gefunden</p>
            ) : filtered.map((c) => (
              <button
                key={c.id}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(c.id)
                  setQuery("")
                  setOpen(false)
                }}
              >
                <span className="font-medium">{c.code}</span>
                <span className="ml-2 text-muted-foreground">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Star } from 'lucide-react'
import { useBillingPriceLists } from '@/hooks'
import { PriceListFormSheet } from './price-list-form-sheet'

function formatDate(date: string | Date | null): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

export function PriceListList() {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  const { data, isLoading } = useBillingPriceLists({
    search: search || undefined,
    page,
    pageSize: 25,
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Preislisten</h2>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Neue Preisliste
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Name, Beschreibung suchen..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-8"
          />
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Beschreibung</TableHead>
            <TableHead>Standard</TableHead>
            <TableHead>Gültig von</TableHead>
            <TableHead>Gültig bis</TableHead>
            <TableHead>Aktiv</TableHead>
            <TableHead>Einträge</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Laden...
              </TableCell>
            </TableRow>
          ) : !data?.items?.length ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Keine Preislisten gefunden
              </TableCell>
            </TableRow>
          ) : (
            data.items.map((pl) => {
              const typed = pl as typeof pl & { _count?: { entries?: number; addresses?: number } }
              return (
                <TableRow
                  key={pl.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/orders/price-lists/${pl.id}`)}
                >
                  <TableCell className="font-medium">{pl.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {pl.description || '-'}
                  </TableCell>
                  <TableCell>
                    <Star
                      className={`h-4 w-4 ${pl.isDefault ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
                    />
                  </TableCell>
                  <TableCell>{formatDate(pl.validFrom)}</TableCell>
                  <TableCell>{formatDate(pl.validTo)}</TableCell>
                  <TableCell>
                    <Badge variant={pl.isActive ? 'default' : 'secondary'}>
                      {pl.isActive ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                  <TableCell>{typed._count?.entries ?? 0}</TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {data && data.total > 25 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {data.total} Preislisten gesamt
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Zurück
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 25 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Weiter
            </Button>
          </div>
        </div>
      )}

      {/* Create Sheet */}
      <PriceListFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  )
}

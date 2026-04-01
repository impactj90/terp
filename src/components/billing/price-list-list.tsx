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
import { useTranslations } from 'next-intl'
import { useBillingPriceLists } from '@/hooks'
import { PriceListFormSheet } from './price-list-form-sheet'

function formatDate(date: string | Date | null): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

export function PriceListList() {
  const router = useRouter()
  const t = useTranslations('billingPriceLists')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  const { data, isLoading } = useBillingPriceLists({
    type: 'sales',
    search: search || undefined,
    page,
    pageSize: 25,
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-2xl font-bold">{t('title')}</h2>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('newPriceList')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-8"
          />
        </div>
      </div>

      {/* Mobile: card list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 sm:hidden">{t('loading')}</p>
      ) : !data?.items?.length ? (
        <p className="text-sm text-muted-foreground py-4 sm:hidden">{t('noPriceListsFound')}</p>
      ) : (
        <div className="divide-y sm:hidden">
          {data.items.map((pl) => {
            const typed = pl as typeof pl & { _count?: { entries?: number } }
            return (
              <div
                key={pl.id}
                className="flex items-start justify-between gap-3 p-3 active:bg-muted/50 cursor-pointer"
                onClick={() => router.push(`/orders/price-lists/${pl.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{pl.name}</span>
                    {pl.isDefault && (
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 shrink-0" />
                    )}
                  </div>
                  {pl.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{pl.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={pl.isActive ? 'default' : 'secondary'}>
                      {pl.isActive ? t('active') : t('inactive')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {typed._count?.entries ?? 0} {t('columnEntries')}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Desktop: table */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columnName')}</TableHead>
              <TableHead>{t('columnDescription')}</TableHead>
              <TableHead>{t('columnDefault')}</TableHead>
              <TableHead>{t('columnValidFrom')}</TableHead>
              <TableHead>{t('columnValidTo')}</TableHead>
              <TableHead>{t('columnActive')}</TableHead>
              <TableHead>{t('columnEntries')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {t('loading')}
                </TableCell>
              </TableRow>
            ) : !data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {t('noPriceListsFound')}
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((pl) => {
                const typed = pl as typeof pl & { _count?: { entries?: number; salesAddresses?: number; purchaseAddresses?: number } }
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
                        {pl.isActive ? t('active') : t('inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>{typed._count?.entries ?? 0}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.total > 25 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            &lt;
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {Math.ceil(data.total / 25)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 25 >= data.total}
            onClick={() => setPage(page + 1)}
          >
            &gt;
          </Button>
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

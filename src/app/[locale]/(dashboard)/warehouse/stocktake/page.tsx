'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission, useWhStocktakes } from '@/hooks'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search } from 'lucide-react'
import { StocktakeFormSheet } from '@/components/warehouse/stocktake-form-sheet'

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('warehouseStocktake')
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    DRAFT: 'secondary',
    IN_PROGRESS: 'default',
    COMPLETED: 'outline',
    CANCELLED: 'destructive',
  }
  const labels: Record<string, string> = {
    DRAFT: t('statusDraft'),
    IN_PROGRESS: t('statusInProgress'),
    COMPLETED: t('statusCompleted'),
    CANCELLED: t('statusCancelled'),
  }
  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {labels[status] ?? status}
    </Badge>
  )
}

export default function WhStocktakePage() {
  const t = useTranslations('warehouseStocktake')
  const locale = useLocale()
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['wh_stocktake.view'])
  const { allowed: canCreate } = useHasPermission(['wh_stocktake.create'])

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL')
  const [page, setPage] = React.useState(1)
  const [createOpen, setCreateOpen] = React.useState(false)

  const { data, isLoading } = useWhStocktakes({
    status: statusFilter === 'ALL' ? undefined : statusFilter as 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
    search: search || undefined,
    page,
    pageSize: 25,
  })

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/warehouse')
    }
  }, [authLoading, permLoading, canAccess, router])

  if (authLoading || permLoading) return null

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 25)

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t('pageTitle')}</h1>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('createStocktake')}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('name')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); setPage(1) }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder={t('statusLabel')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('filterAll')}</SelectItem>
            <SelectItem value="DRAFT">{t('statusDraft')}</SelectItem>
            <SelectItem value="IN_PROGRESS">{t('statusInProgress')}</SelectItem>
            <SelectItem value="COMPLETED">{t('statusCompleted')}</SelectItem>
            <SelectItem value="CANCELLED">{t('statusCancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-4 text-muted-foreground text-sm">{t('loading')}</div>
      ) : items.length === 0 ? (
        <div className="p-4 text-muted-foreground text-sm">{t('emptyState')}</div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="divide-y sm:hidden">
            {items.map((item) => (
              <div
                key={item.id}
                className="py-3 cursor-pointer"
                onClick={() => router.push(`/warehouse/stocktake/${item.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.number} - {item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(item.referenceDate).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground shrink-0 ml-3">
                    {item._count.positions} {t('positions')}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('number')}</TableHead>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('referenceDate')}</TableHead>
                  <TableHead className="text-right">{t('positions')}</TableHead>
                  <TableHead>{t('createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/warehouse/stocktake/${item.id}`)}
                  >
                    <TableCell className="font-mono">{item.number}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      {new Date(item.referenceDate).toLocaleDateString(locale)}
                    </TableCell>
                    <TableCell className="text-right">{item._count.positions}</TableCell>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleDateString(locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center sm:justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                &laquo;
              </Button>
              <span className="text-xs sm:text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                &raquo;
              </Button>
            </div>
          )}
        </>
      )}

      {/* Create Sheet */}
      <StocktakeFormSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Play } from 'lucide-react'
import { useBillingRecurringInvoices, useGenerateDueRecurringInvoices } from '@/hooks'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

const INTERVAL_KEYS: Record<string, string> = {
  MONTHLY: 'intervalMonthly',
  QUARTERLY: 'intervalQuarterly',
  SEMI_ANNUALLY: 'intervalSemiAnnually',
  ANNUALLY: 'intervalAnnually',
}

function formatDate(date: string | Date | null): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

export function RecurringList() {
  const t = useTranslations('billingRecurring')
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useBillingRecurringInvoices({
    search: search || undefined,
    isActive: activeFilter === 'all' ? undefined : activeFilter === 'active',
    page,
    pageSize: 25,
  })

  const generateDueMutation = useGenerateDueRecurringInvoices()

  const handleGenerateAllDue = async () => {
    try {
      const result = await generateDueMutation.mutateAsync()
      if (result) {
        toast.success(t('generatedSuccess', { generated: result.generated, failed: result.failed }))
      }
    } catch {
      toast.error(t('generateDueError'))
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg sm:text-2xl font-bold">{t('title')}</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleGenerateAllDue} disabled={generateDueMutation.isPending}>
            <Play className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{t('generateAllDue')}</span>
            <span className="sm:hidden">{t('generateAllDue')}</span>
          </Button>
          <Button size="sm" asChild>
            <Link href="/orders/recurring/new">
              <Plus className="h-4 w-4 mr-1" />
              {t('newTemplate')}
            </Link>
          </Button>
        </div>
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
        <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            <SelectItem value="active">{t('active')}</SelectItem>
            <SelectItem value="inactive">{t('inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile: card list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 sm:hidden">{t('loading')}</p>
      ) : !data?.items?.length ? (
        <p className="text-sm text-muted-foreground py-4 sm:hidden">{t('noRecurringFound')}</p>
      ) : (
        <div className="divide-y sm:hidden">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(data.items as any[]).map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 p-3 active:bg-muted/50 cursor-pointer"
              onClick={() => router.push(`/orders/recurring/${item.id}`)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {item.address?.company ?? '-'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={item.isActive ? 'default' : 'secondary'}>
                    {item.isActive ? t('active') : t('inactive')}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {INTERVAL_KEYS[item.interval] ? t(INTERVAL_KEYS[item.interval] as Parameters<typeof t>[0]) : item.interval}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs text-muted-foreground">{t('columnNextDue')}</span>
                <p className="text-sm font-medium">{formatDate(item.nextDueDate)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop: table */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columnName')}</TableHead>
              <TableHead>{t('columnCustomer')}</TableHead>
              <TableHead>{t('columnInterval')}</TableHead>
              <TableHead>{t('columnNextDue')}</TableHead>
              <TableHead>{t('columnLastGenerated')}</TableHead>
              <TableHead>{t('columnActive')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t('loading')}
                </TableCell>
              </TableRow>
            ) : !data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t('noRecurringFound')}
                </TableCell>
              </TableRow>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (data.items as any[]).map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/orders/recurring/${item.id}`)}
                >
                  <TableCell className="font-medium max-w-[250px] truncate">{item.name}</TableCell>
                  <TableCell>
                    {item.address?.company ?? '-'}
                  </TableCell>
                  <TableCell>{INTERVAL_KEYS[item.interval] ? t(INTERVAL_KEYS[item.interval] as Parameters<typeof t>[0]) : item.interval}</TableCell>
                  <TableCell>{formatDate(item.nextDueDate)}</TableCell>
                  <TableCell>{formatDate(item.lastGeneratedAt)}</TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? 'default' : 'secondary'}>
                      {item.isActive ? t('active') : t('inactive')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
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
    </div>
  )
}

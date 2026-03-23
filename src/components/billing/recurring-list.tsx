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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('title')}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleGenerateAllDue} disabled={generateDueMutation.isPending}>
            <Play className="h-4 w-4 mr-1" />
            {t('generateAllDue')}
          </Button>
          <Button asChild>
            <Link href="/orders/recurring/new">
              <Plus className="h-4 w-4 mr-1" />
              {t('newTemplate')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-8"
          />
        </div>
        <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v); setPage(1) }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            <SelectItem value="active">{t('active')}</SelectItem>
            <SelectItem value="inactive">{t('inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
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
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  {item.address?.company ?? '-'}
                </TableCell>
                <TableCell>{INTERVAL_KEYS[item.interval] ? t(INTERVAL_KEYS[item.interval] as any) : item.interval}</TableCell>
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

      {/* Pagination */}
      {data && data.total > 25 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('totalEntries', { count: data.total })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t('previous')}
            </Button>
            <span className="text-sm">{t('page', { page })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 25 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

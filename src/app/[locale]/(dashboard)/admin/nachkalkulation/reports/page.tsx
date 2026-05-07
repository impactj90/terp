'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import { useModules } from '@/hooks/use-modules'
import { useNkByDimension } from '@/hooks/use-nk-reports'
import { useOrderTypes } from '@/hooks/use-order-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { NkDimensionDrillSheet } from '@/components/nachkalkulation/nk-dimension-drill-sheet'

type Dimension = 'customer' | 'service_object' | 'employee' | 'order_type'
type SortBy = 'margin_desc' | 'margin_asc' | 'hourly_margin_desc' | 'revenue_desc'

function isoNDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0] ?? ''
}

function isoToday(): string {
  return new Date().toISOString().split('T')[0] ?? ''
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toFixed(1)} %`
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface DimensionDrillState {
  dimensionLabel: string
  orders: Array<{
    orderId: string
    code: string
    name: string
    db2Percent: number | null
    hourlyMargin: number | null
  }>
}

export default function NachkalkulationReportsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission([
    'nachkalkulation.view',
    'nachkalkulation.manage',
    'nachkalkulation.config',
  ])
  const t = useTranslations('nachkalkulation.reports')

  const { data: modules } = useModules(!authLoading && !permLoading && canAccess)
  const enabledModules = (modules && 'modules' in modules ? modules.modules : []) as Array<{ module: string }>
  const isModuleEnabled = enabledModules.some((m) => m.module === 'nachkalkulation')

  const { data: orderTypesData } = useOrderTypes({
    enabled: !authLoading && !permLoading && canAccess && isModuleEnabled,
    isActive: true,
  })

  const [dateFrom, setDateFrom] = React.useState(isoNDaysAgo(30))
  const [dateTo, setDateTo] = React.useState(isoToday())
  const [orderTypeId, setOrderTypeId] = React.useState<string>('__all__')
  const [sortBy, setSortBy] = React.useState<SortBy>('margin_desc')
  const [limit, setLimit] = React.useState<number>(25)
  const [activeTab, setActiveTab] = React.useState<Dimension>('customer')
  const [drill, setDrill] = React.useState<DimensionDrillState | null>(null)

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  if (authLoading || permLoading) {
    return <ReportsPageSkeleton />
  }

  if (!canAccess) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {!isModuleEnabled && (
        <Alert>
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">{t('filters.dateFrom')}</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">{t('filters.dateTo')}</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('filters.orderType')}</Label>
              <Select
                value={orderTypeId}
                onValueChange={(v) => setOrderTypeId(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    {t('filters.orderTypeAll')}
                  </SelectItem>
                  {(orderTypesData?.data ?? []).map((ot) => (
                    <SelectItem key={ot.id} value={ot.id}>
                      {ot.code} - {ot.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('filters.sortByLabel')}</Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="margin_desc">{t('filters.sortDb2Percent')}</SelectItem>
                  <SelectItem value="hourly_margin_desc">
                    {t('filters.sortHourlyMargin')}
                  </SelectItem>
                  <SelectItem value="revenue_desc">{t('filters.sortRevenue')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('filters.limit')}</Label>
              <Select
                value={String(limit)}
                onValueChange={(v) => setLimit(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">{t('filters.limit10')}</SelectItem>
                  <SelectItem value="25">{t('filters.limit25')}</SelectItem>
                  <SelectItem value="50">{t('filters.limit50')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Dimension)}>
        <TabsList>
          <TabsTrigger value="customer">{t('tabCustomer')}</TabsTrigger>
          <TabsTrigger value="service_object">{t('tabServiceObject')}</TabsTrigger>
          <TabsTrigger value="employee">{t('tabEmployee')}</TabsTrigger>
          <TabsTrigger value="order_type">{t('tabOrderType')}</TabsTrigger>
        </TabsList>

        {(['customer', 'service_object', 'employee', 'order_type'] as Dimension[]).map(
          (dim) => (
            <TabsContent key={dim} value={dim} className="mt-6">
              <DimensionTable
                dimension={dim}
                dateFrom={dateFrom}
                dateTo={dateTo}
                orderTypeId={orderTypeId === '__all__' ? null : orderTypeId}
                sortBy={sortBy}
                limit={limit}
                enabled={
                  isModuleEnabled &&
                  !authLoading &&
                  !permLoading &&
                  canAccess &&
                  activeTab === dim
                }
                onDrill={setDrill}
              />
            </TabsContent>
          ),
        )}
      </Tabs>

      {/* Drill sheet */}
      <NkDimensionDrillSheet
        open={!!drill}
        onOpenChange={(open) => {
          if (!open) setDrill(null)
        }}
        dimensionLabel={drill?.dimensionLabel ?? ''}
        orders={drill?.orders ?? []}
      />
    </div>
  )
}

interface DimensionTableProps {
  dimension: Dimension
  dateFrom: string
  dateTo: string
  orderTypeId: string | null
  sortBy: SortBy
  limit: number
  enabled: boolean
  onDrill: (state: DimensionDrillState) => void
}

function DimensionTable({
  dimension,
  dateFrom,
  dateTo,
  orderTypeId,
  sortBy,
  limit,
  enabled,
  onDrill,
}: DimensionTableProps) {
  const t = useTranslations('nachkalkulation.reports')
  const query = useNkByDimension(
    {
      dimension,
      dateFrom,
      dateTo,
      orderTypeId: orderTypeId ?? undefined,
      sortBy,
      limit,
    },
    { enabled },
  )

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full" />
  }
  if (query.isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{t('loadError')}</p>
        </CardContent>
      </Card>
    )
  }

  const rows =
    (query.data?.data ?? []) as Array<{
      dimensionKey: string
      dimensionLabel: string
      orderCount: number
      totalRevenue: number
      db2Percent: number | null
      hourlyMargin: number | null
      estimatedShare: number
      orders?: Array<{
        orderId: string
        code: string
        name: string
        db2Percent: number | null
        hourlyMargin: number | null
      }>
    }>

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{t('noData')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columnDimensionLabel')}</TableHead>
              <TableHead className="text-right">{t('columnOrderCount')}</TableHead>
              <TableHead className="text-right">{t('columnRevenue')}</TableHead>
              <TableHead className="text-right">{t('columnDb2Percent')}</TableHead>
              <TableHead className="text-right">{t('columnHourlyMargin')}</TableHead>
              <TableHead className="text-right">{t('columnEstimated')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.dimensionKey}
                className="cursor-pointer"
                onClick={() => {
                  onDrill({
                    dimensionLabel: row.dimensionLabel,
                    orders: row.orders ?? [],
                  })
                }}
              >
                <TableCell className="font-medium">{row.dimensionLabel}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.orderCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtMoney(row.totalRevenue)} €
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtPct(row.db2Percent)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtMoney(row.hourlyMargin)} €/h
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {(row.estimatedShare * 100).toFixed(0)} %
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ReportsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

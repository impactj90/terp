'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Building2, ChevronDown, ChevronRight } from 'lucide-react'
import { useCrmGroupList, useCrmGroupStats } from '@/hooks/use-crm-addresses'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function GroupRow({
  group,
  dateFrom,
  dateTo,
}: {
  group: { id: string; company: string; number: string; type: string; city: string | null; _count: { childAddresses: number } }
  dateFrom?: string
  dateTo?: string
}) {
  const t = useTranslations('crmReports')
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const { data: stats, isLoading } = useCrmGroupStats(
    group.id,
    dateFrom,
    dateTo,
    expanded
  )

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <button
              className="hover:underline text-left"
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/crm/addresses/${group.id}`)
              }}
            >
              {group.company}
            </button>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground">{group.number}</TableCell>
        <TableCell className="text-center">{group._count.childAddresses}</TableCell>
        <TableCell className="text-right">
          {isLoading && expanded ? (
            <Skeleton className="h-4 w-20 ml-auto" />
          ) : stats ? (
            formatCurrency(stats.revenue.totalNet)
          ) : (
            '—'
          )}
        </TableCell>
        <TableCell className="text-right">
          {isLoading && expanded ? (
            <Skeleton className="h-4 w-20 ml-auto" />
          ) : stats ? (
            formatCurrency(stats.revenue.totalGross)
          ) : (
            '—'
          )}
        </TableCell>
        <TableCell className="text-center">
          {isLoading && expanded ? (
            <Skeleton className="h-4 w-10 mx-auto" />
          ) : stats ? (
            stats.revenue.documentCount
          ) : (
            '—'
          )}
        </TableCell>
      </TableRow>
      {expanded && stats && (
        <>
          {stats.children.map((child) => (
            <TableRow key={child.id} className="bg-muted/30">
              <TableCell className="pl-12">
                <button
                  className="hover:underline text-left text-sm"
                  onClick={() => router.push(`/crm/addresses/${child.id}`)}
                >
                  {child.company}
                </button>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {child.number}
              </TableCell>
              <TableCell colSpan={4} className="text-sm text-muted-foreground">
                {t('subsidiaries')}
              </TableCell>
            </TableRow>
          ))}
        </>
      )}
    </>
  )
}

export function ReportGroupStats() {
  const t = useTranslations('crmReports')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { data: groups, isLoading } = useCrmGroupList()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-60" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!groups || groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-2 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('noGroups')}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = groups.map((g) => ({
    name: g.company.length > 20 ? g.company.slice(0, 20) + '…' : g.company,
    count: g._count.childAddresses,
  }))

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="groupDateFrom">{t('dateFrom')}</Label>
              <Input
                id="groupDateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="groupDateTo">{t('dateTo')}</Label>
              <Input
                id="groupDateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDateFrom('')
                  setDateTo('')
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {/* KPI: total groups */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t('totalGroups')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{groups.length}</div>
            <p className="text-xs text-muted-foreground">
              {groups.reduce((acc, g) => acc + g._count.childAddresses, 0)} {t('subsidiaryCount')}
            </p>
          </CardContent>
        </Card>

        {/* Chart: subsidiaries per group */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('subsidiaryCount')}</CardTitle>
            <CardDescription>{t('groupReportDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" fontSize={12} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#0088FE" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed group table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('groupReport')}</CardTitle>
          <CardDescription>
            {t('groupReportDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('groupName')}</TableHead>
                <TableHead>{t('company')}</TableHead>
                <TableHead className="text-center">{t('subsidiaryCount')}</TableHead>
                <TableHead className="text-right">{t('revenueNet')}</TableHead>
                <TableHead className="text-right">{t('revenueGross')}</TableHead>
                <TableHead className="text-center">{t('documents')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <GroupRow
                  key={group.id}
                  group={group}
                  dateFrom={dateFrom || undefined}
                  dateTo={dateTo || undefined}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

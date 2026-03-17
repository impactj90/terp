'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  useCrmInquiryPipeline,
  useCrmInquiryByEffort,
} from '@/hooks/use-crm-reports'

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#0088FE',
  IN_PROGRESS: '#FFBB28',
  CLOSED: '#00C49F',
  CANCELLED: '#FF8042',
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Offen',
  IN_PROGRESS: 'In Bearbeitung',
  CLOSED: 'Geschlossen',
  CANCELLED: 'Storniert',
}

const EFFORT_COLORS: Record<string, string> = {
  Gering: '#00C49F',
  Mittel: '#FFBB28',
  Hoch: '#FF8042',
  Unbekannt: '#8884d8',
}

export function ReportInquiryPipeline() {
  const t = useTranslations('crmReports')

  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')

  const filterParams: { dateFrom?: string; dateTo?: string } = {}
  if (dateFrom) filterParams.dateFrom = `${dateFrom}T00:00:00.000Z`
  if (dateTo) filterParams.dateTo = `${dateTo}T23:59:59.999Z`

  const { data: pipeline, isLoading: pipelineLoading } =
    useCrmInquiryPipeline(filterParams)
  const { data: effortData, isLoading: effortLoading } =
    useCrmInquiryByEffort(filterParams)

  const statusChartData =
    pipeline?.byStatus.map((item) => ({
      name: STATUS_LABELS[item.status] ?? item.status,
      count: item.count,
      status: item.status,
    })) ?? []

  const effortChartData =
    effortData?.byEffort.map((item) => ({
      name: item.effort,
      value: item.count,
      effort: item.effort,
    })) ?? []

  return (
    <div className="space-y-4">
      {/* Optional Date Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label>{t('dateFrom')}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label>{t('dateTo')}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Bar Chart: Inquiries by Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('inquiriesByStatus')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : statusChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('noData')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={statusChartData}>
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {statusChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={STATUS_COLORS[entry.status] ?? '#8884d8'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Stat Card: Avg days to close */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('avgDaysToClose')}</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex items-center justify-center h-[200px]">
                <div className="text-center">
                  <div className="text-5xl font-bold">
                    {pipeline?.avgDaysToClose ?? '—'}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('day')}(e)
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Table: Top Addresses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('topAddresses')}</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : !pipeline?.topAddresses.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('noData')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('company')}</TableHead>
                    <TableHead className="text-right">{t('count')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pipeline.topAddresses.map((addr) => (
                    <TableRow key={addr.addressId}>
                      <TableCell>{addr.company}</TableCell>
                      <TableCell className="text-right">{addr.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart: By Effort */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('inquiriesByEffort')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {effortLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : effortChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('noData')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={effortChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {effortChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={EFFORT_COLORS[entry.effort] ?? '#8884d8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

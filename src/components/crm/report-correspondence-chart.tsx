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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import {
  useCrmCorrespondenceByPeriod,
  useCrmCorrespondenceByType,
} from '@/hooks/use-crm-reports'

const DIRECTION_COLORS = {
  incoming: '#0088FE',
  outgoing: '#00C49F',
  internal: '#FFBB28',
}

const TYPE_COLORS: Record<string, string> = {
  phone: '#0088FE',
  email: '#00C49F',
  letter: '#FFBB28',
  fax: '#FF8042',
  visit: '#8884d8',
}

const TYPE_LABELS: Record<string, string> = {
  phone: 'Telefon',
  email: 'E-Mail',
  letter: 'Brief',
  fax: 'Fax',
  visit: 'Besuch',
}

export function ReportCorrespondenceChart() {
  const t = useTranslations('crmReports')

  const [dateFrom, setDateFrom] = React.useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [groupBy, setGroupBy] = React.useState<'day' | 'week' | 'month'>(
    'month'
  )

  const dateFromISO = `${dateFrom}T00:00:00.000Z`
  const dateToISO = `${dateTo}T23:59:59.999Z`

  const { data: periodData, isLoading: periodLoading } =
    useCrmCorrespondenceByPeriod(
      { dateFrom: dateFromISO, dateTo: dateToISO, groupBy },
      true
    )

  const { data: typeData, isLoading: typeLoading } =
    useCrmCorrespondenceByType(
      { dateFrom: dateFromISO, dateTo: dateToISO },
      true
    )

  const pieData =
    typeData?.byType.map((item) => ({
      name: TYPE_LABELS[item.type] ?? item.type,
      value: item.count,
      type: item.type,
    })) ?? []

  return (
    <div className="space-y-4">
      {/* Filters */}
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
            <div className="space-y-1">
              <Label>{t('groupBy')}</Label>
              <Select
                value={groupBy}
                onValueChange={(v) =>
                  setGroupBy(v as 'day' | 'week' | 'month')
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{t('day')}</SelectItem>
                  <SelectItem value="week">{t('week')}</SelectItem>
                  <SelectItem value="month">{t('month')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Stacked Bar Chart: Correspondence over time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('correspondenceOverTime')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {periodLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : !periodData?.periods.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('noData')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={periodData.periods}>
                  <XAxis dataKey="period" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="incoming"
                    name={t('incoming')}
                    stackId="a"
                    fill={DIRECTION_COLORS.incoming}
                  />
                  <Bar
                    dataKey="outgoing"
                    name={t('outgoing')}
                    stackId="a"
                    fill={DIRECTION_COLORS.outgoing}
                  />
                  <Bar
                    dataKey="internal"
                    name={t('internal')}
                    stackId="a"
                    fill={DIRECTION_COLORS.internal}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart: Correspondence by type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('correspondenceByType')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {typeLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('noData')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={90}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={TYPE_COLORS[entry.type] ?? '#8884d8'}
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

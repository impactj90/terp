'use client'

import { useTranslations } from 'next-intl'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useCrmAddressStats } from '@/hooks/use-crm-reports'

const TYPE_COLORS: Record<string, string> = {
  CUSTOMER: '#0088FE',
  SUPPLIER: '#00C49F',
  BOTH: '#FFBB28',
}

export function ReportAddressStats() {
  const t = useTranslations('crmReports')
  const { data, isLoading } = useCrmAddressStats()

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[250px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[250px] w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  const typeLabels: Record<string, string> = {
    CUSTOMER: t('customer'),
    SUPPLIER: t('supplier'),
    BOTH: t('both'),
  }

  const typeData =
    data?.byType.map((item) => ({
      name: typeLabels[item.type] ?? item.type,
      value: item.count,
      type: item.type,
    })) ?? []

  const activeData = [
    { name: t('active'), value: data?.active ?? 0 },
    { name: t('inactive'), value: data?.inactive ?? 0 },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Pie Chart: Addresses by Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('addressByType')}</CardTitle>
        </CardHeader>
        <CardContent>
          {typeData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('noData')}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {typeData.map((entry, index) => (
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

      {/* Bar Chart: Active vs Inactive */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('activeInactive')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={activeData}>
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#0088FE" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp } from 'lucide-react'
import { formatBalance } from '@/lib/time-utils'
import { cn } from '@/lib/utils'

interface FlextimeDataPoint {
  month: number
  balance: number
  hasData: boolean
}

interface FlextimeChartProps {
  data: FlextimeDataPoint[]
  isLoading: boolean
  className?: string
}

export function FlextimeChart({
  data,
  isLoading,
  className,
}: FlextimeChartProps) {
  const t = useTranslations('yearOverview')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)

  const monthShort = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short' })
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(2024, i, 1)
      return formatter.format(date)
    })
  }, [locale])

  // Calculate max absolute value for scaling
  const maxValue = useMemo(() => {
    const values = data.filter((d) => d.hasData).map((d) => Math.abs(d.balance))
    return Math.max(...values, 60) // minimum 1 hour scale
  }, [data])

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('flextimeProgression')}
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    )
  }

  const hasAnyData = data.some((d) => d.hasData)

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {t('flextimeProgression')}
        </CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {!hasAnyData ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            {tCommon('noDataAvailable')}
          </div>
        ) : (
          <div className="relative">
            {/* Tooltip */}
            {hoveredMonth !== null && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground px-2 py-1 rounded text-sm shadow-md border z-10 whitespace-nowrap">
                {monthShort[hoveredMonth - 1]}:{' '}
                {data[hoveredMonth - 1]?.hasData
                  ? formatBalance(data[hoveredMonth - 1]?.balance ?? 0)
                  : t('noData')}
              </div>
            )}

            {/* Chart container */}
            <div className="flex gap-1 items-end">
              {data.map((point, index) => (
                <div
                  key={index}
                  className="flex flex-col items-center flex-1"
                  onMouseEnter={() => setHoveredMonth(index + 1)}
                  onMouseLeave={() => setHoveredMonth(null)}
                >
                  {/* Bar container */}
                  <div className="relative h-32 w-full flex flex-col">
                    {/* Center line (zero line) */}
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-border" />

                    {/* Bar */}
                    {point.hasData && (
                      <div
                        className={cn(
                          'absolute left-0.5 right-0.5 rounded-sm transition-all cursor-pointer',
                          point.balance >= 0
                            ? 'bottom-1/2 bg-green-500 hover:bg-green-600'
                            : 'top-1/2 bg-red-500 hover:bg-red-600'
                        )}
                        style={{
                          height: `${
                            (Math.abs(point.balance) / maxValue) * 50
                          }%`,
                          minHeight: point.balance !== 0 ? '2px' : '0',
                        }}
                      />
                    )}

                    {/* No data indicator */}
                    {!point.hasData && (
                      <div className="absolute top-1/2 left-0.5 right-0.5 h-1 -translate-y-1/2 rounded-full bg-muted-foreground/20" />
                    )}
                  </div>

                  {/* Month label */}
                  <span
                    className={cn(
                      'text-[10px] mt-1',
                      point.hasData
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/40'
                    )}
                  >
                    {monthShort[index]}
                  </span>
                </div>
              ))}
            </div>

            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-[10px] text-muted-foreground -ml-6 pointer-events-none">
              <span>{formatBalance(maxValue)}</span>
              <span>0:00</span>
              <span>{formatBalance(-maxValue)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

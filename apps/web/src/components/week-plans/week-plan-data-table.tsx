'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Eye, Edit, Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { components } from '@/lib/api/types'

type WeekPlan = components['schemas']['WeekPlan']
type DayPlanSummary = components['schemas']['DayPlanSummary']

interface WeekPlanDataTableProps {
  weekPlans: WeekPlan[]
  isLoading: boolean
  onView: (weekPlan: WeekPlan) => void
  onEdit: (weekPlan: WeekPlan) => void
  onDelete: (weekPlan: WeekPlan) => void
  onCopy: (weekPlan: WeekPlan) => void
}

// Helper function to count work days
function countWorkDays(weekPlan: WeekPlan): number {
  const days = [
    weekPlan.monday_day_plan_id,
    weekPlan.tuesday_day_plan_id,
    weekPlan.wednesday_day_plan_id,
    weekPlan.thursday_day_plan_id,
    weekPlan.friday_day_plan_id,
    weekPlan.saturday_day_plan_id,
    weekPlan.sunday_day_plan_id,
  ]
  return days.filter(Boolean).length
}

// Day plan cell component
function DayPlanCell({
  dayPlan,
  isWeekend,
}: {
  dayPlan: DayPlanSummary | null | undefined
  isWeekend: boolean
}) {
  if (!dayPlan) {
    return (
      <span className={cn('text-muted-foreground text-xs', isWeekend && 'opacity-50')}>
        -
      </span>
    )
  }
  return (
    <Badge
      variant="outline"
      className={cn('text-xs truncate max-w-full', isWeekend && 'opacity-75')}
      title={`${dayPlan.code}: ${dayPlan.name}`}
    >
      {dayPlan.code}
    </Badge>
  )
}

export function WeekPlanDataTable({
  weekPlans,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onCopy,
}: WeekPlanDataTableProps) {
  const t = useTranslations('adminWeekPlans')

  if (isLoading) {
    return <WeekPlanDataTableSkeleton />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead className="w-16 text-center">{t('mon')}</TableHead>
          <TableHead className="w-16 text-center">{t('tue')}</TableHead>
          <TableHead className="w-16 text-center">{t('wed')}</TableHead>
          <TableHead className="w-16 text-center">{t('thu')}</TableHead>
          <TableHead className="w-16 text-center">{t('fri')}</TableHead>
          <TableHead className="w-16 text-center text-muted-foreground">{t('sat')}</TableHead>
          <TableHead className="w-16 text-center text-muted-foreground">{t('sun')}</TableHead>
          <TableHead className="w-20 text-center">{t('columnDays')}</TableHead>
          <TableHead className="w-20">{t('columnStatus')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('srActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {weekPlans.map((weekPlan) => (
          <TableRow
            key={weekPlan.id}
            className="cursor-pointer"
            onClick={() => onView(weekPlan)}
          >
            <TableCell className="font-mono text-sm">{weekPlan.code}</TableCell>
            <TableCell className="font-medium">{weekPlan.name}</TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.monday_day_plan} isWeekend={false} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.tuesday_day_plan} isWeekend={false} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.wednesday_day_plan} isWeekend={false} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.thursday_day_plan} isWeekend={false} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.friday_day_plan} isWeekend={false} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.saturday_day_plan} isWeekend={true} />
            </TableCell>
            <TableCell className="text-center">
              <DayPlanCell dayPlan={weekPlan.sunday_day_plan} isWeekend={true} />
            </TableCell>
            <TableCell className="text-center text-sm text-muted-foreground">
              {countWorkDays(weekPlan)}/7
            </TableCell>
            <TableCell>
              <Badge variant={weekPlan.is_active ? 'default' : 'secondary'}>
                {weekPlan.is_active ? t('statusActive') : t('statusInactive')}
              </Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('srActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(weekPlan)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('actionViewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(weekPlan)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('actionEdit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCopy(weekPlan)}>
                    <Copy className="mr-2 h-4 w-4" />
                    {t('actionCopy')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(weekPlan)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('actionDelete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function WeekPlanDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">
            <Skeleton className="h-4 w-12" />
          </TableHead>
          <TableHead>
            <Skeleton className="h-4 w-16" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-16">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-20">
            <Skeleton className="h-4 w-8" />
          </TableHead>
          <TableHead className="w-20">
            <Skeleton className="h-4 w-12" />
          </TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-12 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-8" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-8 w-8" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

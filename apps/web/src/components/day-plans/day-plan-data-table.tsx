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
import { formatTime, formatDuration } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']

interface DayPlanDataTableProps {
  dayPlans: DayPlan[]
  isLoading: boolean
  onView: (dayPlan: DayPlan) => void
  onEdit: (dayPlan: DayPlan) => void
  onDelete: (dayPlan: DayPlan) => void
  onCopy: (dayPlan: DayPlan) => void
}

export function DayPlanDataTable({
  dayPlans,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onCopy,
}: DayPlanDataTableProps) {
  const t = useTranslations('adminDayPlans')

  if (isLoading) {
    return <DayPlanDataTableSkeleton />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead className="w-24">{t('columnType')}</TableHead>
          <TableHead className="w-32">{t('columnTimeWindow')}</TableHead>
          <TableHead className="w-24">{t('columnTarget')}</TableHead>
          <TableHead className="w-20">{t('columnBreaks')}</TableHead>
          <TableHead className="w-20">{t('columnStatus')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('srActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dayPlans.map((dayPlan) => (
          <TableRow
            key={dayPlan.id}
            className="cursor-pointer"
            onClick={() => onView(dayPlan)}
          >
            <TableCell className="font-mono text-sm">{dayPlan.code}</TableCell>
            <TableCell className="font-medium">{dayPlan.name}</TableCell>
            <TableCell>
              <Badge variant={dayPlan.plan_type === 'fixed' ? 'secondary' : 'outline'}>
                {dayPlan.plan_type === 'fixed' ? t('typeFixed') : t('typeFlextime')}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {dayPlan.come_from !== null && dayPlan.come_from !== undefined
                ? `${formatTime(dayPlan.come_from)} - ${formatTime(dayPlan.go_to ?? 0)}`
                : '-'}
            </TableCell>
            <TableCell>{formatDuration(dayPlan.regular_hours)}</TableCell>
            <TableCell>{dayPlan.breaks?.length ?? 0}</TableCell>
            <TableCell>
              <Badge variant={dayPlan.is_active ? 'default' : 'secondary'}>
                {dayPlan.is_active ? t('statusActive') : t('statusInactive')}
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
                  <DropdownMenuItem onClick={() => onView(dayPlan)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('actionViewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(dayPlan)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('actionEdit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCopy(dayPlan)}>
                    <Copy className="mr-2 h-4 w-4" />
                    {t('actionCopy')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(dayPlan)}
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

function DayPlanDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-8" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

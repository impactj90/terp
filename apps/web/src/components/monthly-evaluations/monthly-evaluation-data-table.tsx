'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Eye, Edit, Trash2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type MonthlyEvaluation = components['schemas']['MonthlyEvaluation']

interface MonthlyEvaluationDataTableProps {
  items: MonthlyEvaluation[]
  isLoading: boolean
  onView: (item: MonthlyEvaluation) => void
  onEdit: (item: MonthlyEvaluation) => void
  onSetDefault: (item: MonthlyEvaluation) => void
  onDelete: (item: MonthlyEvaluation) => void
}

export function MonthlyEvaluationDataTable({
  items,
  isLoading,
  onView,
  onEdit,
  onSetDefault,
  onDelete,
}: MonthlyEvaluationDataTableProps) {
  const t = useTranslations('adminMonthlyEvaluations')

  if (isLoading) {
    return <MonthlyEvaluationDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  const formatMinuteValue = (value: number | undefined | null): string => {
    if (value === undefined || value === null || value === 0) return '-'
    return formatDuration(value)
  }

  const formatCarryoverValue = (value: number | undefined | null): string => {
    if (value === undefined || value === null) return '-'
    return t('labelDays', { value: String(value) })
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead>{t('columnDescription')}</TableHead>
          <TableHead className="w-32">{t('columnFlextimePositive')}</TableHead>
          <TableHead className="w-32">{t('columnFlextimeNegative')}</TableHead>
          <TableHead className="w-32">{t('columnOvertimeThreshold')}</TableHead>
          <TableHead className="w-36">{t('columnMaxCarryover')}</TableHead>
          <TableHead className="w-16">{t('columnDefault')}</TableHead>
          <TableHead className="w-24">{t('columnStatus')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            className={`cursor-pointer ${item.is_default ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}`}
            onClick={() => onView(item)}
          >
            <TableCell>
              <span className="font-medium">{item.name}</span>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
              {item.description || '-'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatMinuteValue(item.flextime_cap_positive)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatMinuteValue(item.flextime_cap_negative)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatMinuteValue(item.overtime_threshold)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatCarryoverValue(item.max_carryover_vacation)}
            </TableCell>
            <TableCell>
              {item.is_default && (
                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
              )}
            </TableCell>
            <TableCell>
              <Badge variant={item.is_active ? 'default' : 'secondary'}>
                {item.is_active ? t('statusActive') : t('statusInactive')}
              </Badge>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('actions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(item)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  {!item.is_default && item.is_active && (
                    <DropdownMenuItem onClick={() => onSetDefault(item)}>
                      <Star className="mr-2 h-4 w-4" />
                      {t('setDefault')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('delete')}
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

function MonthlyEvaluationDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-36"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16"><Skeleton className="h-4 w-8" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-14" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-4" /></TableCell>
            <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Eye, Edit, Trash2, CalendarDays, Building2 } from 'lucide-react'
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
import type { components } from '@/lib/api/types'

type Holiday = components['schemas']['Holiday']

interface HolidayDataTableProps {
  holidays: Holiday[]
  isLoading: boolean
  onView: (holiday: Holiday) => void
  onEdit: (holiday: Holiday) => void
  onDelete: (holiday: Holiday) => void
}

export function HolidayDataTable({
  holidays,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: HolidayDataTableProps) {
  const t = useTranslations('adminHolidays')

  if (isLoading) {
    return <HolidayDataTableSkeleton />
  }

  if (holidays.length === 0) {
    return null
  }

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'EEEE, MMMM d, yyyy')
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">{t('columnDate')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead className="w-24">{t('columnType')}</TableHead>
          <TableHead className="w-32">{t('columnScope')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holidays.map((holiday) => (
          <TableRow
            key={holiday.id}
            className="cursor-pointer"
            onClick={() => onView(holiday)}
          >
            <TableCell className="font-mono text-sm">
              {formatDate(holiday.holiday_date)}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-red-100 dark:bg-red-900/30">
                  <CalendarDays className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <span className="font-medium">{holiday.name}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={holiday.is_half_day ? 'secondary' : 'default'}>
                {holiday.is_half_day ? t('halfDay') : t('fullDay')}
              </Badge>
            </TableCell>
            <TableCell>
              {holiday.applies_to_all ? (
                <span className="text-muted-foreground">{t('scopeAll')}</span>
              ) : (
                <div className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  <span className="text-sm">{t('scopeDepartment')}</span>
                </div>
              )}
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
                  <DropdownMenuItem onClick={() => onView(holiday)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(holiday)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(holiday)}
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

function HolidayDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

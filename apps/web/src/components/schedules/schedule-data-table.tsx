'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ScheduleTimingBadge } from './schedule-timing-badge'
import type { components } from '@/lib/api/types'

type Schedule = components['schemas']['Schedule']

interface ScheduleDataTableProps {
  items: Schedule[]
  isLoading: boolean
  onView: (item: Schedule) => void
  onEdit: (item: Schedule) => void
  onDelete: (item: Schedule) => void
  onToggleEnabled?: (item: Schedule, enabled: boolean) => void
}

export function ScheduleDataTable({
  items,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onToggleEnabled,
}: ScheduleDataTableProps) {
  const t = useTranslations('adminSchedules')

  if (isLoading) {
    return <ScheduleDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead>{t('columnTimingType')}</TableHead>
          <TableHead className="w-24">{t('columnActive')}</TableHead>
          <TableHead className="w-20">{t('columnTaskCount')}</TableHead>
          <TableHead>{t('columnLastRun')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            className="cursor-pointer"
            onClick={() => onView(item)}
          >
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell>
              <ScheduleTimingBadge
                timingType={item.timing_type}
                timingConfig={item.timing_config}
              />
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={item.is_enabled ?? false}
                onCheckedChange={(checked) => onToggleEnabled?.(item, checked)}
              />
            </TableCell>
            <TableCell>{item.tasks?.length ?? 0}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {item.last_run_at
                ? new Date(item.last_run_at).toLocaleString()
                : t('neverRun')}
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('columnActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(item)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('actionView')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('actionEdit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(item)}
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

function ScheduleDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-8" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-5 w-9" /></TableCell>
            <TableCell><Skeleton className="h-4 w-6" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

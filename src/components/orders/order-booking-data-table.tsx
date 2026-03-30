'use client'

import * as React from 'react'
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
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

interface OrderBookingWithRelations {
  id: string
  bookingDate?: string | null
  booking_date?: string | null
  timeMinutes?: number
  time_minutes?: number
  description?: string | null
  source?: string
  employee?: {
    id: string
    firstName?: string
    first_name?: string
    lastName?: string
    last_name?: string
  } | null
  activity?: {
    id: string
    name?: string
    code?: string
  } | null
}

interface OrderBookingDataTableProps {
  items: OrderBookingWithRelations[]
  isLoading: boolean
  onEdit: (item: OrderBookingWithRelations) => void
  onDelete: (item: OrderBookingWithRelations) => void
}

function formatTimeMinutes(minutes: number | undefined): string {
  if (!minutes) return '0:00'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}:${mins.toString().padStart(2, '0')}`
}

export function OrderBookingDataTable({
  items,
  isLoading,
  onEdit,
  onDelete,
}: OrderBookingDataTableProps) {
  const t = useTranslations('adminOrders')

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy')
  }

  const getSourceBadge = (source: string | undefined) => {
    switch (source) {
      case 'manual':
        return <Badge variant="green">{t('sourceManual')}</Badge>
      case 'auto':
        return <Badge variant="blue">{t('sourceAuto')}</Badge>
      case 'import':
        return <Badge variant="orange">{t('sourceImport')}</Badge>
      default:
        return <Badge variant="secondary">{source || '-'}</Badge>
    }
  }

  if (isLoading) {
    return <OrderBookingDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">{t('columnDate')}</TableHead>
          <TableHead>{t('columnEmployee')}</TableHead>
          <TableHead>{t('columnActivity')}</TableHead>
          <TableHead className="w-20">{t('columnTime')}</TableHead>
          <TableHead>{t('columnDescription')}</TableHead>
          <TableHead className="w-20">{t('columnSource')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="text-sm">{formatDate(String(item.bookingDate ?? item.booking_date ?? ''))}</TableCell>
            <TableCell className="font-medium">
              {item.employee?.firstName ?? item.employee?.first_name} {item.employee?.lastName ?? item.employee?.last_name}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {item.activity?.name || '-'}
            </TableCell>
            <TableCell className="font-mono text-sm">
              {formatTimeMinutes(item.timeMinutes ?? item.time_minutes)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
              {item.description || '-'}
            </TableCell>
            <TableCell>{getSourceBadge(item.source)}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('columnActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(item)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
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

function OrderBookingDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

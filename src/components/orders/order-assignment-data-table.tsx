'use client'

import * as React from 'react'
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
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
import { OrderAssignmentRoleBadge } from './order-assignment-role-badge'

interface OrderAssignmentWithEmployee {
  id: string
  role: string
  validFrom?: Date | string | null
  valid_from?: string | null
  validTo?: Date | string | null
  valid_to?: string | null
  employee?: {
    id: string
    firstName?: string
    first_name?: string
    lastName?: string
    last_name?: string
    personnelNumber?: string
    personnel_number?: string
  } | null
}

interface OrderAssignmentDataTableProps {
  items: OrderAssignmentWithEmployee[]
  isLoading: boolean
  onEdit: (item: OrderAssignmentWithEmployee) => void
  onDelete: (item: OrderAssignmentWithEmployee) => void
}

export function OrderAssignmentDataTable({
  items,
  isLoading,
  onEdit,
  onDelete,
}: OrderAssignmentDataTableProps) {
  const t = useTranslations('adminOrders')

  const formatDate = (date: string | undefined | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd.MM.yyyy')
  }

  if (isLoading) {
    return <OrderAssignmentDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columnEmployee')}</TableHead>
          <TableHead className="w-24">{t('columnRole')}</TableHead>
          <TableHead className="w-28">{t('columnValidFrom')}</TableHead>
          <TableHead className="w-28">{t('columnValidTo')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">
              {item.employee?.firstName ?? item.employee?.first_name} {item.employee?.lastName ?? item.employee?.last_name}
            </TableCell>
            <TableCell>
              <OrderAssignmentRoleBadge role={item.role} />
            </TableCell>
            <TableCell className="text-sm">{formatDate(String(item.validFrom ?? item.valid_from ?? ''))}</TableCell>
            <TableCell className="text-sm">{formatDate(String(item.validTo ?? item.valid_to ?? ''))}</TableCell>
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

function OrderAssignmentDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 3 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

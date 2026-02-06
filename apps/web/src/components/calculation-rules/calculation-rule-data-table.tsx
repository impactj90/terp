'use client'

import * as React from 'react'
import { MoreHorizontal, Eye, Edit, Calculator, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
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

type CalculationRule = components['schemas']['CalculationRule']

interface CalculationRuleDataTableProps {
  items: CalculationRule[]
  isLoading: boolean
  onView: (item: CalculationRule) => void
  onEdit: (item: CalculationRule) => void
  onDelete: (item: CalculationRule) => void
}

export function CalculationRuleDataTable({
  items,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: CalculationRuleDataTableProps) {
  const t = useTranslations('adminCalculationRules')

  if (isLoading) {
    return <CalculationRuleDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead className="w-32">{t('columnValue')}</TableHead>
          <TableHead className="w-24">{t('columnFactor')}</TableHead>
          <TableHead className="w-24">{t('columnAccount')}</TableHead>
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
            className="cursor-pointer"
            onClick={() => onView(item)}
          >
            <TableCell className="font-mono text-sm">{item.code}</TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <Calculator className="h-4 w-4" />
                </div>
                <span className="font-medium">{item.name}</span>
              </div>
            </TableCell>
            <TableCell className="text-sm">
              {item.value === 0 ? (
                <span className="text-muted-foreground">{t('valueDailyTarget')}</span>
              ) : (
                t('valueMinutes', { value: item.value })
              )}
            </TableCell>
            <TableCell className="text-sm font-mono">
              {item.factor}x
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {item.account_id ? '...' : '-'}
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

function CalculationRuleDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-32"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-14" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

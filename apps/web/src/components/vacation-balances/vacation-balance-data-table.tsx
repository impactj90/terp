'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Eye, Edit } from 'lucide-react'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type VacationBalance = components['schemas']['VacationBalance']

interface VacationBalanceDataTableProps {
  balances: VacationBalance[]
  isLoading: boolean
  onView: (balance: VacationBalance) => void
  onEdit: (balance: VacationBalance) => void
}

function getRemainingBadgeClass(remaining: number): string {
  if (remaining > 5) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
  if (remaining >= 1) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
  return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
}

function formatDecimal(value: number | undefined | null): string {
  return value?.toFixed(1) ?? '0.0'
}

export function VacationBalanceDataTable({
  balances,
  isLoading,
  onView,
  onEdit,
}: VacationBalanceDataTableProps) {
  const t = useTranslations('adminVacationBalances')

  if (isLoading) {
    return <VacationBalanceDataTableSkeleton />
  }

  if (balances.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columnEmployee')}</TableHead>
          <TableHead className="w-24">{t('columnPersonnelNumber')}</TableHead>
          <TableHead className="w-16">{t('columnYear')}</TableHead>
          <TableHead className="w-20 text-right">{t('columnBaseEntitlement')}</TableHead>
          <TableHead className="w-20 text-right">{t('columnAdditionalEntitlement')}</TableHead>
          <TableHead className="w-20 text-right">{t('columnCarryover')}</TableHead>
          <TableHead className="w-20 text-right">{t('columnManualAdjustment')}</TableHead>
          <TableHead className="w-20 text-right">{t('columnTotalEntitlement')}</TableHead>
          <TableHead className="w-16 text-right">{t('columnUsedDays')}</TableHead>
          <TableHead className="w-16 text-right">{t('columnPlannedDays')}</TableHead>
          <TableHead className="w-24 text-right">{t('columnRemainingDays')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {balances.map((balance) => {
          const firstName = balance.employee?.first_name ?? ''
          const lastName = balance.employee?.last_name ?? ''
          const remaining = balance.remaining_days ?? 0

          return (
            <TableRow
              key={balance.id}
              className="cursor-pointer"
              onClick={() => onView(balance)}
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {firstName[0] ?? ''}
                    {lastName[0] ?? ''}
                  </div>
                  <span className="font-medium">
                    {firstName} {lastName}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm">
                {balance.employee?.personnel_number ?? '-'}
              </TableCell>
              <TableCell>{balance.year}</TableCell>
              <TableCell className="text-right">{formatDecimal(balance.base_entitlement)}</TableCell>
              <TableCell className="text-right">{formatDecimal(balance.additional_entitlement)}</TableCell>
              <TableCell className="text-right">{formatDecimal(balance.carryover_from_previous)}</TableCell>
              <TableCell className="text-right">{formatDecimal(balance.manual_adjustment)}</TableCell>
              <TableCell className="text-right font-bold">{formatDecimal(balance.total_entitlement)}</TableCell>
              <TableCell className="text-right">{formatDecimal(balance.used_days)}</TableCell>
              <TableCell className="text-right">{formatDecimal(balance.planned_days)}</TableCell>
              <TableCell className="text-right">
                <Badge variant="outline" className={getRemainingBadgeClass(remaining)}>
                  {formatDecimal(remaining)}
                </Badge>
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
                    <DropdownMenuItem onClick={() => onView(balance)}>
                      <Eye className="mr-2 h-4 w-4" />
                      {t('viewDetails')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(balance)}>
                      <Edit className="mr-2 h-4 w-4" />
                      {t('editBalance')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function VacationBalanceDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16"><Skeleton className="h-4 w-10" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16"><Skeleton className="h-4 w-10" /></TableHead>
          <TableHead className="w-16"><Skeleton className="h-4 w-10" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-10" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-10" /></TableCell>
            <TableCell><Skeleton className="h-4 w-10" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

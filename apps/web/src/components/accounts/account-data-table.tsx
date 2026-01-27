'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Award,
  BarChart3,
  Scale,
  Lock,
} from 'lucide-react'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import type { components } from '@/lib/api/types'

type Account = components['schemas']['Account']

interface AccountDataTableProps {
  accounts: Account[]
  isLoading: boolean
  onView: (account: Account) => void
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
}

const accountTypeConfig: Record<string, {
  labelKey: string
  icon: React.ElementType
  variant: 'default' | 'secondary' | 'outline'
}> = {
  bonus: { labelKey: 'typeBonus', icon: Award, variant: 'default' },
  tracking: { labelKey: 'typeTracking', icon: BarChart3, variant: 'secondary' },
  balance: { labelKey: 'typeBalance', icon: Scale, variant: 'outline' },
  time: { labelKey: 'typeTime', icon: BarChart3, variant: 'secondary' },
  deduction: { labelKey: 'typeDeduction', icon: BarChart3, variant: 'secondary' },
  vacation: { labelKey: 'typeVacation', icon: Scale, variant: 'outline' },
  sick: { labelKey: 'typeSick', icon: Scale, variant: 'outline' },
}

const unitLabelKeys: Record<string, string> = {
  minutes: 'unitMinutes',
  hours: 'unitHours',
  days: 'unitDays',
}

export function AccountDataTable({
  accounts,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: AccountDataTableProps) {
  const t = useTranslations('adminAccounts')

  if (isLoading) {
    return <AccountDataTableSkeleton />
  }

  if (accounts.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12" />
          <TableHead className="w-20">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead className="w-28">{t('columnType')}</TableHead>
          <TableHead className="w-20">{t('columnUnit')}</TableHead>
          <TableHead className="w-24">{t('columnStatus')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => {
          const typeKey = (account as Record<string, unknown>).account_type as string || 'tracking'
          const typeInfo = accountTypeConfig[typeKey] ?? { labelKey: typeKey, icon: BarChart3, variant: 'secondary' as const }
          const TypeIcon = typeInfo.icon
          // unit field comes from runtime but may not be in TS types
          const unit = (account as Record<string, unknown>).unit as string | undefined

          return (
            <TableRow
              key={account.id}
              className="cursor-pointer"
              onClick={() => onView(account)}
            >
              <TableCell>
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <TypeIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm font-medium">
                {account.code}
              </TableCell>
              <TableCell>
                <span className="font-medium">{account.name}</span>
              </TableCell>
              <TableCell>
                <Badge variant={typeInfo.variant}>{t(typeInfo.labelKey as Parameters<typeof t>[0])}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {unit ? (unitLabelKeys[unit] ? t(unitLabelKeys[unit] as Parameters<typeof t>[0]) : unit) : '-'}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {account.is_system && (
                    <Badge variant="outline" className="text-xs">
                      <Lock className="mr-1 h-3 w-3" />
                      {t('statusSystem')}
                    </Badge>
                  )}
                  {!account.is_active && (
                    <Badge variant="secondary" className="text-xs">
                      {t('statusInactive')}
                    </Badge>
                  )}
                  {account.is_active && !account.is_system && (
                    <Badge variant="default" className="text-xs">
                      {t('statusActive')}
                    </Badge>
                  )}
                </div>
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
                    <DropdownMenuItem onClick={() => onView(account)}>
                      <Eye className="mr-2 h-4 w-4" />
                      {t('viewDetails')}
                    </DropdownMenuItem>
                    {account.is_system ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem disabled>
                              <Edit className="mr-2 h-4 w-4" />
                              {t('edit')}
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('systemCannotModify')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <DropdownMenuItem onClick={() => onEdit(account)}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t('edit')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {account.is_system ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuItem disabled>
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('delete')}
                            </DropdownMenuItem>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('systemCannotDelete')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(account)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('delete')}
                      </DropdownMenuItem>
                    )}
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

function AccountDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12" />
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

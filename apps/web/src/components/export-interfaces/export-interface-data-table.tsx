'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Eye, Edit, Users, Trash2 } from 'lucide-react'
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

type ExportInterface = components['schemas']['ExportInterface']

interface ExportInterfaceDataTableProps {
  items: ExportInterface[]
  isLoading: boolean
  onView: (item: ExportInterface) => void
  onEdit: (item: ExportInterface) => void
  onManageAccounts: (item: ExportInterface) => void
  onDelete: (item: ExportInterface) => void
}

export function ExportInterfaceDataTable({
  items,
  isLoading,
  onView,
  onEdit,
  onManageAccounts,
  onDelete,
}: ExportInterfaceDataTableProps) {
  const t = useTranslations('adminExportInterfaces')

  if (isLoading) {
    return <ExportInterfaceDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">{t('columnNumber')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead className="w-28">{t('columnMandant')}</TableHead>
          <TableHead>{t('columnExportPath')}</TableHead>
          <TableHead className="w-24">{t('columnStatus')}</TableHead>
          <TableHead className="w-20">{t('columnAccounts')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const accountCount = item.accounts?.length ?? 0

          return (
            <TableRow
              key={item.id}
              className="cursor-pointer"
              onClick={() => onView(item)}
            >
              <TableCell className="font-mono text-sm">
                {item.interface_number}
              </TableCell>
              <TableCell>
                <span className="font-medium">{item.name}</span>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.mandant_number || '-'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                {item.export_path || '-'}
              </TableCell>
              <TableCell>
                <Badge variant={item.is_active ? 'default' : 'secondary'}>
                  {item.is_active ? t('statusActive') : t('statusInactive')}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {accountCount}
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
                    <DropdownMenuItem onClick={() => onManageAccounts(item)}>
                      <Users className="mr-2 h-4 w-4" />
                      {t('manageAccounts')}
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
          )
        })}
      </TableBody>
    </Table>
  )
}

function ExportInterfaceDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16"><Skeleton className="h-4 w-6" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-14" /></TableHead>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-6" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-4 w-6" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

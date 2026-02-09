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
import { MacroTypeBadge } from './macro-type-badge'
import { MacroActionBadge } from './macro-action-badge'
import type { components } from '@/lib/api/types'

type Macro = components['schemas']['schema1']

interface MacroDataTableProps {
  items: Macro[]
  isLoading: boolean
  onView: (item: Macro) => void
  onEdit: (item: Macro) => void
  onDelete: (item: Macro) => void
  onToggleActive?: (item: Macro, active: boolean) => void
}

export function MacroDataTable({
  items,
  isLoading,
  onView,
  onEdit,
  onDelete,
  onToggleActive,
}: MacroDataTableProps) {
  const t = useTranslations('adminMacros')

  if (isLoading) {
    return <MacroDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead>{t('columnType')}</TableHead>
          <TableHead>{t('columnActionType')}</TableHead>
          <TableHead className="w-24">{t('columnActive')}</TableHead>
          <TableHead className="w-24">{t('columnAssignments')}</TableHead>
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
              <MacroTypeBadge type={item.macro_type} />
            </TableCell>
            <TableCell>
              <MacroActionBadge action={item.action_type} />
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={item.is_active ?? false}
                onCheckedChange={(checked) => onToggleActive?.(item, checked)}
              />
            </TableCell>
            <TableCell>{item.assignments?.length ?? 0}</TableCell>
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

function MacroDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-8" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-5 w-28 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-5 w-9" /></TableCell>
            <TableCell><Skeleton className="h-4 w-6" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

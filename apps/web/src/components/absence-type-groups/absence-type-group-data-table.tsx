'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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

type AbsenceTypeGroup = components['schemas']['AbsenceTypeGroup']

interface AbsenceTypeGroupDataTableProps {
  groups: AbsenceTypeGroup[]
  isLoading: boolean
  onEdit: (group: AbsenceTypeGroup) => void
  onDelete: (group: AbsenceTypeGroup) => void
  onToggleActive?: (group: AbsenceTypeGroup, isActive: boolean) => void
}

export function AbsenceTypeGroupDataTable({
  groups,
  isLoading,
  onEdit,
  onDelete,
  onToggleActive,
}: AbsenceTypeGroupDataTableProps) {
  const t = useTranslations('adminAbsenceTypeGroups')

  if (isLoading) {
    return <AbsenceTypeGroupDataTableSkeleton />
  }

  if (groups.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">{t('columnCode')}</TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead className="hidden md:table-cell">{t('columnDescription')}</TableHead>
          <TableHead className="w-28">{t('columnStatus')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('actions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow key={group.id}>
            <TableCell className="font-mono text-sm font-medium">
              {group.code}
            </TableCell>
            <TableCell>
              <span className="font-medium">{group.name}</span>
            </TableCell>
            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
              {group.description
                ? group.description.length > 60
                  ? `${group.description.slice(0, 60)}...`
                  : group.description
                : '-'}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {group.is_active ? (
                  <Badge variant="default" className="text-xs">
                    {t('statusActive')}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    {t('statusInactive')}
                  </Badge>
                )}
                {onToggleActive && (
                  <Switch
                    checked={group.is_active ?? true}
                    onCheckedChange={(checked) => onToggleActive(group, checked)}
                  />
                )}
              </div>
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('actions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(group)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(group)}
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

function AbsenceTypeGroupDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead className="w-28"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-40" /></TableCell>
            <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AuditLogEntry } from './types'

interface AuditLogDataTableProps {
  items: AuditLogEntry[]
  isLoading: boolean
  onRowClick: (item: AuditLogEntry) => void
}

const actionBadgeConfig: Record<string, { variant: string }> = {
  create:   { variant: 'green' },
  update:   { variant: 'blue' },
  delete:   { variant: 'red' },
  approve:  { variant: 'green' },
  reject:   { variant: 'red' },
  cancel:   { variant: 'red' },
  close:    { variant: 'purple' },
  reopen:   { variant: 'orange' },
  finalize: { variant: 'indigo' },
  forward:  { variant: 'cyan' },
  export:   { variant: 'cyan' },
  import:   { variant: 'teal' },
}

export function AuditLogDataTable({ items, isLoading, onRowClick }: AuditLogDataTableProps) {
  const t = useTranslations('auditLogs')
  const locale = useLocale()

  const formatDateTime = (dateStr: string | Date) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(dateStr))
    } catch {
      return String(dateStr)
    }
  }

  if (isLoading) {
    return <AuditLogDataTableSkeleton />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('table.timestamp')}</TableHead>
          <TableHead>{t('table.user')}</TableHead>
          <TableHead>{t('table.action')}</TableHead>
          <TableHead>{t('table.entityType')}</TableHead>
          <TableHead>{t('table.entityName')}</TableHead>
          <TableHead>{t('table.ipAddress')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('table.details')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const badgeConfig = actionBadgeConfig[item.action] ?? { variant: 'outline' as const, className: '' }
          return (
            <TableRow
              key={item.id}
              className="cursor-pointer"
              onClick={() => onRowClick(item)}
            >
              <TableCell className="text-sm text-muted-foreground">
                {formatDateTime(item.performedAt)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {item.user && (
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {item.user.displayName?.charAt(0)?.toUpperCase() ?? '?'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span>{item.user?.displayName ?? '-'}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={badgeConfig.variant as 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'indigo' | 'cyan' | 'teal'}>
                  {t(`actions.${item.action}` as Parameters<typeof t>[0])}
                </Badge>
              </TableCell>
              <TableCell>
                {t(`entityTypes.${item.entityType}` as Parameters<typeof t>[0])}
              </TableCell>
              <TableCell className="max-w-[150px] truncate">
                {item.entityName ?? '-'}
              </TableCell>
              <TableCell className="font-mono text-sm">
                {item.ipAddress ?? t('system')}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onRowClick(item) }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function AuditLogDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: 7 }).map((_, i) => (
            <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            {Array.from({ length: 7 }).map((_, j) => (
              <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

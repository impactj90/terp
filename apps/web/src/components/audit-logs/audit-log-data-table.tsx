'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { components } from '@/lib/api/types'

type AuditLogEntry = components['schemas']['AuditLog']

interface AuditLogDataTableProps {
  items: AuditLogEntry[]
  isLoading: boolean
  onRowClick: (item: AuditLogEntry) => void
}

const actionBadgeConfig: Record<string, { variant: 'default' | 'destructive' | 'outline'; className: string }> = {
  create:  { variant: 'default',     className: 'bg-green-600 hover:bg-green-700' },
  update:  { variant: 'outline',     className: 'border-blue-500 text-blue-700' },
  delete:  { variant: 'destructive', className: '' },
  approve: { variant: 'default',     className: 'bg-green-600 hover:bg-green-700' },
  reject:  { variant: 'destructive', className: '' },
  close:   { variant: 'outline',     className: 'border-purple-500 text-purple-700' },
  reopen:  { variant: 'outline',     className: 'border-orange-500 text-orange-700' },
  export:  { variant: 'outline',     className: 'border-cyan-500 text-cyan-700' },
  import:  { variant: 'outline',     className: 'border-teal-500 text-teal-700' },
  login:   { variant: 'outline',     className: '' },
  logout:  { variant: 'outline',     className: '' },
}

export function AuditLogDataTable({ items, isLoading, onRowClick }: AuditLogDataTableProps) {
  const t = useTranslations('auditLogs')
  const locale = useLocale()

  const formatDateTime = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(dateStr))
    } catch {
      return dateStr
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
                {formatDateTime(item.performed_at)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {item.user && (
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={item.user.avatar_url} />
                      <AvatarFallback className="text-xs">
                        {item.user.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span>{item.user?.display_name ?? '-'}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
                  {t(`actions.${item.action}` as Parameters<typeof t>[0])}
                </Badge>
              </TableCell>
              <TableCell>
                {t(`entityTypes.${item.entity_type}` as Parameters<typeof t>[0])}
              </TableCell>
              <TableCell className="max-w-[150px] truncate">
                {item.entity_name ?? '-'}
              </TableCell>
              <TableCell className="font-mono text-sm">
                {item.ip_address ?? t('system')}
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

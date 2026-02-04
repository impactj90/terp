'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Eye } from 'lucide-react'
import { useEvaluationLogs, useUsers } from '@/hooks/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { components } from '@/lib/api/types'

interface LogsTabProps {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
  onViewDetail: (entry: components['schemas']['EvaluationLogEntry']) => void
}

type ActionType = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'close' | 'reopen'

const actionBadgeConfig: Record<ActionType, { variant: 'default' | 'destructive' | 'outline'; className: string }> = {
  create: { variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  update: { variant: 'outline', className: 'border-blue-500 text-blue-700' },
  delete: { variant: 'destructive', className: '' },
  approve: { variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  reject: { variant: 'destructive', className: '' },
  close: { variant: 'outline', className: 'border-purple-500 text-purple-700' },
  reopen: { variant: 'outline', className: 'border-orange-500 text-orange-700' },
}

export function LogsTab({ from, to, employeeId, departmentId, onViewDetail }: LogsTabProps) {
  const t = useTranslations('evaluations')
  const locale = useLocale()

  // Tab-specific filter state
  const [entityType, setEntityType] = React.useState<string | null>(null)
  const [action, setAction] = React.useState<string | null>(null)
  const [userId, setUserId] = React.useState<string | null>(null)
  const [page, setPage] = React.useState(1)
  const [limit, setLimit] = React.useState(50)

  // Reset page when any filter changes
  React.useEffect(() => {
    setPage(1)
  }, [from, to, employeeId, departmentId, entityType, action, userId])

  // Users for filter dropdown
  const { data: usersData } = useUsers({ enabled: !!from && !!to })
  const users = (usersData as { data?: Array<{ id: string; display_name: string }> })?.data ?? []

  const { data, isLoading } = useEvaluationLogs({
    from,
    to,
    employee_id: employeeId,
    department_id: departmentId,
    entity_type: entityType ?? undefined,
    action: action ?? undefined,
    user_id: userId ?? undefined,
    limit,
    page,
    enabled: !!from && !!to,
  })

  const items = data?.data ?? []
  const total = data?.meta?.total ?? 0
  const totalPages = Math.ceil(total / limit)

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

  const truncateChanges = (changes: Record<string, never> | null | undefined): string => {
    if (!changes) return '-'
    const str = JSON.stringify(changes)
    return str.length > 80 ? str.slice(0, 80) + '...' : str
  }

  return (
    <div className="space-y-4">
      {/* Tab-specific filters */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 md:items-end">
        <div className="space-y-2">
          <Label>{t('filters.entityType')}</Label>
          <Select
            value={entityType ?? 'all'}
            onValueChange={(value) => setEntityType(value === 'all' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allEntityTypes')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allEntityTypes')}</SelectItem>
              {['booking', 'absence', 'monthly_value', 'daily_value'].map((et) => (
                <SelectItem key={et} value={et}>
                  {t(`entityTypes.${et}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('filters.action')}</Label>
          <Select
            value={action ?? 'all'}
            onValueChange={(value) => setAction(value === 'all' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allActions')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allActions')}</SelectItem>
              {['create', 'update', 'delete', 'approve', 'reject', 'close', 'reopen'].map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`actions.${a}` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('filters.user')}</Label>
          <Select
            value={userId ?? 'all'}
            onValueChange={(value) => setUserId(value === 'all' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('filters.allUsers')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allUsers')}</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Result count */}
      <div className="text-sm text-muted-foreground">
        {total === 1
          ? t('count.item', { count: total })
          : t('count.items', { count: total })}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LogsDataTableSkeleton />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">{t('empty.logs')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('logs.timestamp')}</TableHead>
                  <TableHead>{t('logs.user')}</TableHead>
                  <TableHead>{t('logs.action')}</TableHead>
                  <TableHead>{t('logs.entityType')}</TableHead>
                  <TableHead>{t('logs.entityName')}</TableHead>
                  <TableHead>{t('logs.changes')}</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const badgeConfig = actionBadgeConfig[item.action] ?? { variant: 'outline' as const, className: '' }
                  return (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => onViewDetail(item)}
                    >
                      <TableCell>{formatDateTime(item.performed_at)}</TableCell>
                      <TableCell>{item.user?.display_name ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
                          {t(`actions.${item.action}` as Parameters<typeof t>[0])}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t(`entityTypes.${item.entity_type}` as Parameters<typeof t>[0])}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">{item.entity_name ?? '-'}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs">
                        {truncateChanges(item.changes)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onViewDetail(item) }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(newLimit) => {
            setLimit(newLimit)
            setPage(1)
          }}
        />
      )}
    </div>
  )
}

function LogsDataTableSkeleton() {
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

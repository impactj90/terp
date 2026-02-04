'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useAuditLogs, useUsers } from '@/hooks/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import {
  AuditLogSkeleton,
  AuditLogFilters,
  AuditLogDataTable,
  AuditLogDetailSheet,
} from '@/components/audit-logs'
import type { DateRange } from '@/components/ui/date-range-picker'
import type { components } from '@/lib/api/types'

export default function AuditLogsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('auditLogs')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Read initial state from URL
  const initialFrom = searchParams.get('from')
  const initialTo = searchParams.get('to')
  const initialUserId = searchParams.get('user_id')
  const initialEntityType = searchParams.get('entity_type')
  const initialEntityId = searchParams.get('entity_id') ?? ''
  const initialAction = searchParams.get('action')

  // Filter state
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => {
    if (initialFrom && initialTo) {
      return { from: new Date(initialFrom), to: new Date(initialTo) }
    }
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    return { from: yesterday, to: now }
  })
  const [userId, setUserId] = React.useState<string | null>(initialUserId)
  const [entityType, setEntityType] = React.useState<string | null>(initialEntityType)
  const [entityId, setEntityId] = React.useState(initialEntityId)
  const [action, setAction] = React.useState<string | null>(initialAction)

  // Pagination state
  const [allItems, setAllItems] = React.useState<components['schemas']['AuditLog'][]>([])
  const [cursor, setCursor] = React.useState<string | undefined>(undefined)
  const [limit] = React.useState(50)

  // Detail sheet state
  const [selectedEntry, setSelectedEntry] = React.useState<components['schemas']['AuditLog'] | null>(null)

  // Auth guard
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  // Sync state to URL
  const stateRef = React.useRef({ dateRange, userId, entityType, entityId, action })
  stateRef.current = { dateRange, userId, entityType, entityId, action }

  const syncToUrl = React.useCallback(
    (overrides: Partial<typeof stateRef.current> = {}) => {
      const state = { ...stateRef.current, ...overrides }
      const params = new URLSearchParams()
      if (state.dateRange?.from) params.set('from', state.dateRange.from.toISOString())
      if (state.dateRange?.to) params.set('to', state.dateRange.to.toISOString())
      if (state.userId) params.set('user_id', state.userId)
      if (state.entityType) params.set('entity_type', state.entityType)
      if (state.entityId) params.set('entity_id', state.entityId)
      if (state.action) params.set('action', state.action)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname]
  )

  // Computed API params
  const fromStr = dateRange?.from?.toISOString()
  const toStr = dateRange?.to?.toISOString()
  const enabled = !authLoading && isAdmin

  const { data, isLoading, isFetching } = useAuditLogs({
    userId: userId ?? undefined,
    entityType: entityType ?? undefined,
    entityId: entityId || undefined,
    action: action as components['schemas']['AuditLog']['action'] | undefined,
    from: fromStr,
    to: toStr,
    limit,
    cursor,
    enabled,
  })

  // Users for filter dropdown
  const { data: usersData, isLoading: usersLoading } = useUsers({ enabled })
  const users = (usersData as { data?: Array<{ id: string; display_name: string }> })?.data ?? []

  // Append new data when it arrives
  React.useEffect(() => {
    if (data?.data) {
      if (cursor) {
        setAllItems(prev => [...prev, ...data.data])
      } else {
        setAllItems(data.data)
      }
    }
  }, [data, cursor])

  // Reset when filters change
  const filterKey = `${userId}-${entityType}-${entityId}-${action}-${fromStr}-${toStr}`
  const prevFilterKey = React.useRef(filterKey)
  React.useEffect(() => {
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey
      setAllItems([])
      setCursor(undefined)
    }
  }, [filterKey])

  const hasMore = (data?.data?.length ?? 0) === limit
  const total = data?.meta?.total ?? allItems.length

  const handleLoadMore = () => {
    const lastItem = allItems[allItems.length - 1]
    if (lastItem) {
      setCursor(lastItem.id)
    }
  }

  // Wrapped state setters that also sync to URL
  const handleDateRangeChange = React.useCallback(
    (range: DateRange | undefined) => {
      setDateRange(range)
      syncToUrl({ dateRange: range })
    },
    [syncToUrl]
  )

  const handleUserChange = React.useCallback(
    (id: string | null) => {
      setUserId(id)
      syncToUrl({ userId: id })
    },
    [syncToUrl]
  )

  const handleEntityTypeChange = React.useCallback(
    (type: string | null) => {
      setEntityType(type)
      syncToUrl({ entityType: type })
    },
    [syncToUrl]
  )

  const handleEntityIdChange = React.useCallback(
    (id: string) => {
      setEntityId(id)
      syncToUrl({ entityId: id })
    },
    [syncToUrl]
  )

  const handleActionChange = React.useCallback(
    (a: string | null) => {
      setAction(a)
      syncToUrl({ action: a })
    },
    [syncToUrl]
  )

  const clearFilters = React.useCallback(() => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const range = { from: yesterday, to: now }
    setDateRange(range)
    setUserId(null)
    setEntityType(null)
    setEntityId('')
    setAction(null)
    syncToUrl({ dateRange: range, userId: null, entityType: null, entityId: '', action: null })
  }, [syncToUrl])

  const hasFilters = !!(userId || entityType || entityId || action)

  if (authLoading) {
    return <AuditLogSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('page.title')}</h1>
        <p className="text-muted-foreground">{t('page.subtitle')}</p>
      </div>

      <AuditLogFilters
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        userId={userId}
        onUserChange={handleUserChange}
        entityType={entityType}
        onEntityTypeChange={handleEntityTypeChange}
        entityId={entityId}
        onEntityIdChange={handleEntityIdChange}
        action={action}
        onActionChange={handleActionChange}
        users={users}
        isLoadingUsers={usersLoading}
        onClearFilters={clearFilters}
        hasFilters={hasFilters}
      />

      <div className="text-sm text-muted-foreground">
        {total === 1
          ? t('count.item', { count: total })
          : t('count.items', { count: total })}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && allItems.length === 0 ? (
            <AuditLogDataTable items={[]} isLoading={true} onRowClick={() => {}} />
          ) : allItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-medium">{t('empty.title')}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t('empty.description')}</p>
            </div>
          ) : (
            <AuditLogDataTable
              items={allItems}
              isLoading={false}
              onRowClick={setSelectedEntry}
            />
          )}
        </CardContent>
      </Card>

      {hasMore && allItems.length > 0 && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isFetching}
          >
            {isFetching ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('pagination.loading')}</>
            ) : (
              t('pagination.loadMore')
            )}
          </Button>
        </div>
      )}

      <AuditLogDetailSheet
        entry={selectedEntry}
        open={!!selectedEntry}
        onOpenChange={(open) => { if (!open) setSelectedEntry(null) }}
      />
    </div>
  )
}

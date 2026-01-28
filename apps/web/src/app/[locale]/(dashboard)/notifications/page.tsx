'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, AlertTriangle, Clock, Settings } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/hooks/api'
import { NotificationPreferencesCard } from '@/components/notifications/notification-preferences'
import { formatRelativeTime } from '@/lib/time-utils'

const notificationIcons = {
  approvals: CheckCircle,
  errors: AlertTriangle,
  reminders: Clock,
  system: Settings,
} as const

type NotificationType = keyof typeof notificationIcons

type Notification = {
  id: string
  type: NotificationType
  title: string
  message: string
  link?: string | null
  read_at?: string | null
  created_at: string
}

const DEFAULT_LIMIT = 20

type TabValue = 'all' | 'preferences'

type TypeFilter = NotificationType | 'all'

type FilterState = {
  type: TypeFilter
  unreadOnly: boolean
}

export default function NotificationsPage() {
  const t = useTranslations('notifications')
  const tc = useTranslations('common')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') === 'preferences' ? 'preferences' : 'all'

  const [tab, setTab] = useState<TabValue>(initialTab)
  const [filters, setFilters] = useState<FilterState>({
    type: 'all',
    unreadOnly: false,
  })
  const [offset, setOffset] = useState(0)
  const [items, setItems] = useState<Notification[]>([])

  useEffect(() => {
    setTab(searchParams.get('tab') === 'preferences' ? 'preferences' : 'all')
  }, [searchParams])

  useEffect(() => {
    setOffset(0)
    setItems([])
  }, [filters, tab])

  const { data, isLoading } = useNotifications({
    limit: DEFAULT_LIMIT,
    offset,
    type: filters.type === 'all' ? undefined : filters.type,
    unread: filters.unreadOnly ? true : undefined,
    enabled: tab === 'all',
  })

  useEffect(() => {
    if (!data?.data) return
    const pageItems = data.data as Notification[]
    if (offset === 0) {
      setItems(pageItems)
    } else if (pageItems.length > 0) {
      setItems((prev) => [...prev, ...pageItems])
    }
  }, [data, offset])

  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  const total = data?.total ?? items.length
  const unreadCount = data?.unread_count ?? 0
  const hasMore = items.length < total

  const filterOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('filterAllTypes') },
      { value: 'approvals' as const, label: t('categoryApprovals') },
      { value: 'errors' as const, label: t('categoryErrors') },
      { value: 'reminders' as const, label: t('categoryReminders') },
      { value: 'system' as const, label: t('categorySystem') },
    ],
    [t]
  )

  const handleFilterTypeChange = (value: string) => {
    setFilters((prev) => ({ ...prev, type: value as TypeFilter }))
  }

  const handleUnreadFilterToggle = (value: boolean) => {
    setFilters((prev) => ({ ...prev, unreadOnly: value }))
  }

  const handleMarkAllRead = () => {
    if (unreadCount === 0) return
    markAllRead.mutate({})
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read_at) {
      markRead.mutate({ path: { id: notification.id } })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
        <TabsList>
          <TabsTrigger value="all">{t('tabAll')}</TabsTrigger>
          <TabsTrigger value="preferences">{t('tabPreferences')}</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>{t('historyTitle')}</CardTitle>
                <CardDescription>
                  {t('historySubtitle')}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={filters.type} onValueChange={handleFilterTypeChange}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder={t('filterAllTypes')} />
                  </SelectTrigger>
                  <SelectContent>
                    {filterOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant={filters.unreadOnly ? 'default' : 'outline'}
                  onClick={() => handleUnreadFilterToggle(!filters.unreadOnly)}
                >
                  {t('filterUnread')}
                </Button>
                <Button variant="outline" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
                  {t('markAllRead')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">{tc('loading')}</div>
              ) : items.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {t('emptyState')}
                </div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {items.map((notification) => {
                    const Icon = notificationIcons[notification.type]
                    const isUnread = !notification.read_at
                    return (
                      <Link
                        key={notification.id}
                        href={notification.link ?? '/notifications'}
                        onClick={() => handleNotificationClick(notification)}
                        className="flex items-start gap-4 p-4 transition hover:bg-muted/50"
                      >
                        <span className="mt-1 rounded-full bg-muted p-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={isUnread ? 'font-semibold text-foreground' : 'text-foreground'}>
                                {notification.title}
                              </span>
                              {isUnread && <Badge variant="secondary">{t('unread')}</Badge>}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(notification.created_at, locale)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{notification.message}</p>
                          <div className="text-xs text-muted-foreground">
                            {t(`typeLabel.${notification.type}`)}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}

              {hasMore && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setOffset((prev) => prev + DEFAULT_LIMIT)}
                  >
                    {t('loadMore')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <NotificationPreferencesCard />
        </TabsContent>
      </Tabs>
    </div>
  )
}

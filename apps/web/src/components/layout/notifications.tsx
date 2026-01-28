'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  Clock,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/api'
import { useNotificationsStream } from '@/hooks/use-notifications-stream'
import { useAuth } from '@/providers/auth-provider'
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

interface NotificationsProps {
  /** Override notification count (for testing/demo) */
  count?: number
}

/**
 * Notifications bell icon with dropdown.
 * Shows badge with unread count and notification list.
 */
export function Notifications({ count }: NotificationsProps) {
  const t = useTranslations('header')
  const locale = useLocale()
  const { isAuthenticated } = useAuth()

  useNotificationsStream({ enabled: isAuthenticated })

  const { data } = useNotifications({ limit: 10, enabled: isAuthenticated })
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  const notifications = (data?.data ?? []) as Notification[]
  const unreadCount =
    count ?? data?.unread_count ?? notifications.filter((n) => !n.read_at).length

  const handleMarkAll = () => {
    if (unreadCount === 0) return
    markAllRead.mutate({})
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read_at) {
      markRead.mutate({ path: { id: notification.id } })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`${t('notifications')}${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>
            {t('notifications')}
            {unreadCount > 0 ? ` (${t('newCount', { count: unreadCount })})` : ''}
          </span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleMarkAll}
            >
              {t('markAllAsRead')}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('noNotifications')}
            </div>
          ) : (
            notifications.map((notification) => {
              const Icon = notificationIcons[notification.type]
              const isUnread = !notification.read_at
              return (
                <DropdownMenuItem
                  key={notification.id}
                  asChild
                  className="flex cursor-pointer flex-col items-start gap-1 p-4"
                  onSelect={() => handleNotificationClick(notification)}
                >
                  <Link
                    href={notification.link ?? '/notifications'}
                    className="flex w-full flex-col gap-1"
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-muted p-1">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                        <span
                          className={`text-sm ${isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                        >
                          {notification.title}
                        </span>
                      </div>
                      {isUnread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(notification.created_at, locale)}
                    </span>
                  </Link>
                </DropdownMenuItem>
              )
            })
          )}
        </ScrollArea>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center text-sm font-medium">
          <Link href="/notifications">{t('viewAllNotifications')}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

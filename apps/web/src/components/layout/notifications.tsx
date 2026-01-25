'use client'

import { Bell } from 'lucide-react'
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

// Placeholder notification type - replace with actual API type when available
interface Notification {
  id: string
  title: string
  message: string
  timestamp: string
  read: boolean
}

// Placeholder notifications - replace with actual API data
const placeholderNotifications: Notification[] = [
  {
    id: '1',
    title: 'Time approval required',
    message: 'John Doe has submitted time entries for approval',
    timestamp: '10 min ago',
    read: false,
  },
  {
    id: '2',
    title: 'Absence request',
    message: 'Jane Smith requested vacation from Dec 20-25',
    timestamp: '1 hour ago',
    read: false,
  },
  {
    id: '3',
    title: 'Monthly report ready',
    message: 'November time tracking report is now available',
    timestamp: '2 hours ago',
    read: true,
  },
]

interface NotificationsProps {
  /** Override notification count (for testing/demo) */
  count?: number
}

/**
 * Notifications bell icon with dropdown.
 * Shows badge with unread count and notification list.
 */
export function Notifications({ count }: NotificationsProps) {
  // In a real implementation, this would come from an API hook
  const notifications = placeholderNotifications
  const unreadCount =
    count ?? notifications.filter((n) => !n.read).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
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
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all as read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="flex cursor-pointer flex-col items-start gap-1 p-4"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span
                    className={`text-sm font-medium ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {notification.title}
                  </span>
                  {!notification.read && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {notification.message}
                </p>
                <span className="text-xs text-muted-foreground">
                  {notification.timestamp}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="justify-center text-sm font-medium">
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

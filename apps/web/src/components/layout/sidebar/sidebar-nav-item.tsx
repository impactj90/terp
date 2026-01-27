'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useSidebar } from './sidebar-context'
import type { NavItem } from './sidebar-nav-config'

interface SidebarNavItemProps {
  item: NavItem
}

/**
 * Individual navigation item component.
 * Handles collapsed state (icon-only with tooltip) and active route highlighting.
 */
export function SidebarNavItem({ item }: SidebarNavItemProps) {
  const pathname = usePathname()
  const { isCollapsed } = useSidebar()
  const t = useTranslations('nav')

  const title = t(item.titleKey as Parameters<typeof t>[0])
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
  const Icon = item.icon

  const content = (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground',
        isCollapsed && 'justify-center px-2'
      )}
      aria-current={isActive ? 'page' : undefined}
      aria-label={isCollapsed ? title : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {!isCollapsed && (
        <>
          <span className="truncate">{title}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <Badge
              variant="secondary"
              className="ml-auto h-5 min-w-5 justify-center rounded-full text-xs"
            >
              {item.badge > 99 ? '99+' : item.badge}
            </Badge>
          )}
        </>
      )}
      {isCollapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
          {item.badge > 9 ? '9+' : item.badge}
        </span>
      )}
    </Link>
  )

  // When collapsed, wrap in tooltip
  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <div className="relative">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {title}
          {item.badge !== undefined && item.badge > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {item.badge}
            </Badge>
          )}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}

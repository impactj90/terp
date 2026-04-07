'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { Star } from 'lucide-react'
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
  /** When true, renders in expanded mode regardless of sidebar state */
  forceExpanded?: boolean
  /** Sibling hrefs in the same section — used to resolve ambiguous prefix matches */
  siblingHrefs?: string[]
}

/**
 * Individual navigation item component.
 * Handles collapsed state (icon-only with tooltip), active route highlighting,
 * left accent bar, and favorite toggle on hover.
 */
export function SidebarNavItem({ item, forceExpanded, siblingHrefs = [] }: SidebarNavItemProps) {
  const pathname = usePathname()
  const { isCompact, isFavorite, addFavorite, removeFavorite } = useSidebar()
  const t = useTranslations('nav')

  const compact = forceExpanded ? false : isCompact
  const title = t(item.titleKey as Parameters<typeof t>[0])
  // Only use startsWith for items with 2+ path segments (e.g. /warehouse/purchase-orders)
  // so that section overview items (e.g. /warehouse) are only active on exact match.
  // Exclude prefix matches when a more specific sibling route also matches.
  const segments = item.href.split('/').filter(Boolean)
  const prefixMatch = segments.length > 1 && pathname.startsWith(`${item.href}/`)
  const hasSiblingMatch = prefixMatch && siblingHrefs.some(
    (sibling) => sibling !== item.href && sibling.startsWith(`${item.href}/`) && pathname.startsWith(sibling)
  )
  const isActive = pathname === item.href || (prefixMatch && !hasSiblingMatch)
  const starred = isFavorite(item.href)
  const Icon = item.icon

  const handleStarClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (starred) {
      removeFavorite(item.href)
    } else {
      addFavorite(item.href)
    }
  }

  const content = (
    <Link
      href={item.href}
      prefetch={false}
      className={cn(
        'group/item relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        compact && 'justify-center px-2'
      )}
      aria-current={isActive ? 'page' : undefined}
      aria-label={compact ? title : undefined}
    >
      {/* Active indicator bar */}
      {isActive && !compact && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary" />
      )}

      <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} aria-hidden="true" />

      {!compact && (
        <>
          <span className="flex-1 truncate">{title}</span>

          {/* Favorite star — visible on hover or when starred */}
          <button
            type="button"
            onClick={handleStarClick}
            className={cn(
              'shrink-0 rounded p-0.5 transition-all',
              starred
                ? 'text-amber-500 opacity-100'
                : 'opacity-0 text-muted-foreground hover:text-amber-500 group-hover/item:opacity-100'
            )}
            aria-label={starred ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star
              className={cn('h-3.5 w-3.5', starred && 'fill-amber-500')}
            />
          </button>

          {item.badge !== undefined && item.badge > 0 && (
            <Badge
              variant="secondary"
              className="ml-0 h-5 min-w-5 justify-center rounded-full text-xs"
            >
              {item.badge > 99 ? '99+' : item.badge}
            </Badge>
          )}
        </>
      )}

      {compact && item.badge !== undefined && item.badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
          {item.badge > 9 ? '9+' : item.badge}
        </span>
      )}
    </Link>
  )

  // When compact, wrap in tooltip
  if (compact) {
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

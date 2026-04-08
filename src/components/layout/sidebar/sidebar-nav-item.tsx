'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { Star } from 'lucide-react'
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
} from '@/components/ui/sidebar'
import { useSidebarExtras } from './sidebar-context'
import type { NavItem } from './sidebar-nav-config'

interface SidebarNavItemProps {
  item: NavItem
  /** Sibling hrefs in the same section — used to resolve ambiguous prefix matches */
  siblingHrefs?: string[]
}

/**
 * Individual navigation item using shadcn SidebarMenuButton.
 * Handles active route highlighting, tooltips in collapsed mode,
 * favorite toggle, and badges.
 */
export function SidebarNavItem({ item, siblingHrefs = [] }: SidebarNavItemProps) {
  const pathname = usePathname()
  const { isFavorite, addFavorite, removeFavorite } = useSidebarExtras()
  const t = useTranslations('nav')

  const title = t(item.titleKey as Parameters<typeof t>[0])

  // Only use startsWith for items with 2+ path segments
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

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={title}
      >
        <Link
          href={item.href}
          prefetch={false}
          aria-current={isActive ? 'page' : undefined}
        >
          <Icon />
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>

      {/* Favorite star — visible on hover */}
      <SidebarMenuAction
        showOnHover={!starred}
        onClick={handleStarClick}
        aria-label={starred ? 'Remove from favorites' : 'Add to favorites'}
        className={starred ? 'text-amber-500 opacity-100' : 'text-muted-foreground hover:text-amber-500'}
      >
        <Star className={starred ? 'fill-amber-500' : ''} />
      </SidebarMenuAction>

      {/* Badge */}
      {item.badge !== undefined && item.badge > 0 && (
        <SidebarMenuBadge>
          {item.badge > 99 ? '99+' : item.badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}

'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { type UserRole } from '@/hooks/use-has-role'
import { useAuth } from '@/providers/auth-provider'
import { useSidebar } from './sidebar-context'
import { SidebarNavItem } from './sidebar-nav-item'
import { navConfig, type NavSection, type NavItem } from './sidebar-nav-config'

interface SidebarNavProps {
  /** Optional custom sections to render instead of default navConfig */
  sections?: NavSection[]
}

/**
 * Filters a nav item based on user role.
 */
function filterNavItem(item: NavItem, userRole: UserRole | null): boolean {
  if (!item.roles) return true
  if (!userRole) return false
  return item.roles.includes(userRole)
}

/**
 * Filters a nav section based on user role.
 */
function filterNavSection(
  section: NavSection,
  userRole: UserRole | null
): NavSection | null {
  // First check if user has access to the section itself
  if (section.roles && (!userRole || !section.roles.includes(userRole))) {
    return null
  }

  // Filter items within the section
  const filteredItems = section.items.filter((item) =>
    filterNavItem(item, userRole)
  )

  // Don't return section if no items are visible
  if (filteredItems.length === 0) {
    return null
  }

  return {
    ...section,
    items: filteredItems,
  }
}

/**
 * Sidebar navigation component.
 * Renders navigation sections with role-based filtering.
 */
export function SidebarNav({ sections = navConfig }: SidebarNavProps) {
  const { user, isAuthenticated } = useAuth()
  const { isCollapsed } = useSidebar()
  const t = useTranslations('nav')

  // Get user role for filtering
  const userRole = isAuthenticated && user ? user.role : null

  // Filter sections based on user role
  const visibleSections = useMemo(() => {
    return sections
      .map((section) => filterNavSection(section, userRole))
      .filter((section): section is NavSection => section !== null)
  }, [sections, userRole])

  return (
    <ScrollArea className="flex-1 px-3">
      <nav className="flex flex-col gap-1 py-2" aria-label="Main navigation">
        {visibleSections.map((section, index) => (
          <div key={section.titleKey} role="group" aria-labelledby={`nav-section-${index}`}>
            {/* Section title - hidden when collapsed */}
            {!isCollapsed && (
              <>
                {index > 0 && <Separator className="my-2" />}
                <h3
                  id={`nav-section-${index}`}
                  className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {t(section.titleKey as Parameters<typeof t>[0])}
                </h3>
              </>
            )}
            {/* Separator for collapsed state */}
            {isCollapsed && index > 0 && <Separator className="my-2" />}

            {/* Navigation items */}
            <ul className="space-y-1" role="list">
              {section.items.map((item) => (
                <li key={item.href}>
                  <SidebarNavItem item={item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </ScrollArea>
  )
}

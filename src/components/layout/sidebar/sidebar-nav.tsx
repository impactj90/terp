'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { usePermissionChecker } from '@/hooks/use-has-permission'
import { useModules } from '@/hooks/use-modules'
import { useSidebar } from './sidebar-context'
import { SidebarNavItem } from './sidebar-nav-item'
import { navConfig, type NavSection, type NavItem } from './sidebar-nav-config'

interface SidebarNavProps {
  /** Optional custom sections to render instead of default navConfig */
  sections?: NavSection[]
}

/**
 * Filters a nav item based on user permissions and enabled modules.
 */
function filterNavItem(
  item: NavItem,
  check: (keys: string[]) => boolean,
  enabledModules: Set<string>
): boolean {
  // Module check: if item requires a module, it must be enabled
  if (item.module && !enabledModules.has(item.module)) return false
  // Permission check
  if (!item.permissions) return true
  return check(item.permissions)
}

/**
 * Filters a nav section based on user permissions and enabled modules.
 * A section is visible if it has at least one visible item.
 * If the section itself requires a module, it's hidden when the module is disabled.
 */
function filterNavSection(
  section: NavSection,
  check: (keys: string[]) => boolean,
  enabledModules: Set<string>
): NavSection | null {
  // Section-level module check
  if (section.module && !enabledModules.has(section.module)) return null

  const filteredItems = section.items.filter((item) =>
    filterNavItem(item, check, enabledModules)
  )

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
 * Renders navigation sections with permission-based and module-based filtering.
 */
export function SidebarNav({ sections = navConfig }: SidebarNavProps) {
  const { isCollapsed } = useSidebar()
  const t = useTranslations('nav')
  const { check, isLoading } = usePermissionChecker()
  const { data: modulesData, isLoading: modulesLoading } = useModules()

  // Build a set of enabled module names for O(1) lookup
  const enabledModules = useMemo(() => {
    if (!modulesData?.modules) return new Set<string>(['core'])
    return new Set<string>(modulesData.modules.map((m) => m.module))
  }, [modulesData])

  // Filter sections based on user permissions and enabled modules
  const visibleSections = useMemo(() => {
    if (isLoading || modulesLoading) return []
    return sections
      .map((section) => filterNavSection(section, check, enabledModules))
      .filter((section): section is NavSection => section !== null)
  }, [sections, check, isLoading, modulesLoading, enabledModules])

  return (
    <ScrollArea className="flex-1 min-h-0 px-3">
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

'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, Star } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { usePermissionChecker } from '@/hooks/use-has-permission'
import { useModules } from '@/hooks/use-modules'
import { cn } from '@/lib/utils'
import { useSidebar } from './sidebar-context'
import { SidebarNavItem } from './sidebar-nav-item'
import { navConfig, type NavSection, type NavItem } from './sidebar-nav-config'

interface SidebarNavProps {
  /** Optional custom sections to render instead of default navConfig */
  sections?: NavSection[]
  /** When true, renders expanded mode regardless of sidebar collapse state */
  forceExpanded?: boolean
}

/**
 * Filters a nav item based on user permissions and enabled modules.
 */
function filterNavItem(
  item: NavItem,
  check: (keys: string[]) => boolean,
  enabledModules: Set<string>
): boolean {
  if (item.module && !enabledModules.has(item.module)) return false
  if (!item.permissions) return true
  return check(item.permissions)
}

/**
 * Filters a nav section based on user permissions and enabled modules.
 */
function filterNavSection(
  section: NavSection,
  check: (keys: string[]) => boolean,
  enabledModules: Set<string>
): NavSection | null {
  if (section.module && !enabledModules.has(section.module)) return null

  const filteredItems = section.items.filter((item) =>
    filterNavItem(item, check, enabledModules)
  )

  if (filteredItems.length === 0) return null

  return { ...section, items: filteredItems }
}

/**
 * Build a flat lookup from href → NavItem for resolving favorites.
 */
function buildItemMap(sections: NavSection[]): Map<string, NavItem> {
  const map = new Map<string, NavItem>()
  for (const section of sections) {
    for (const item of section.items) {
      map.set(item.href, item)
    }
  }
  return map
}

/**
 * Sidebar navigation component.
 * Renders collapsible navigation sections with permission/module filtering,
 * a favorites section, and smooth accordion animations.
 */
export function SidebarNav({ sections = navConfig, forceExpanded }: SidebarNavProps) {
  const {
    isCompact,
    isSectionExpanded,
    toggleSection,
    favorites,
  } = useSidebar()
  const t = useTranslations('nav')
  const tSidebar = useTranslations('sidebar')
  const { check, isLoading } = usePermissionChecker()
  const { data: modulesData, isLoading: modulesLoading } = useModules()

  const compact = forceExpanded ? false : isCompact

  const enabledModules = useMemo(() => {
    if (!modulesData?.modules) return new Set<string>(['core'])
    return new Set<string>(modulesData.modules.map((m) => m.module))
  }, [modulesData])

  const visibleSections = useMemo(() => {
    if (isLoading || modulesLoading) return []
    return sections
      .map((section) => filterNavSection(section, check, enabledModules))
      .filter((section): section is NavSection => section !== null)
  }, [sections, check, isLoading, modulesLoading, enabledModules])

  // Resolve favorite hrefs to actual NavItem objects
  const itemMap = useMemo(() => buildItemMap(visibleSections), [visibleSections])
  const favoriteItems = useMemo(
    () => favorites.map((href) => itemMap.get(href)).filter((item): item is NavItem => !!item),
    [favorites, itemMap]
  )

  return (
    <ScrollArea className="flex-1 min-h-0">
      <nav className="flex flex-col gap-0.5 px-3 py-2" aria-label="Main navigation">

        {/* Favorites section */}
        {favoriteItems.length > 0 && (
          <div role="group" aria-label={tSidebar('favorites')}>
            {!compact && (
              <div className="flex items-center gap-2 px-3 py-1.5">
                <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {tSidebar('favorites')}
                </span>
              </div>
            )}
            <ul className="space-y-0.5" role="list">
              {favoriteItems.map((item) => (
                <li key={item.href}>
                  <SidebarNavItem item={item} forceExpanded={forceExpanded} />
                </li>
              ))}
            </ul>
            <Separator className="my-2" />
          </div>
        )}

        {/* Regular sections with accordions */}
        {visibleSections.map((section, index) => {
          const expanded = isSectionExpanded(section.titleKey)

          return (
            <div key={section.titleKey} role="group" aria-labelledby={`nav-section-${index}`}>
              {/* Section separator */}
              {index > 0 && !compact && <Separator className="my-1.5" />}
              {index > 0 && compact && <Separator className="my-1.5" />}

              {/* Section header — clickable accordion toggle */}
              {!compact && (
                <button
                  id={`nav-section-${index}`}
                  type="button"
                  onClick={() => toggleSection(section.titleKey)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-1.5',
                    'text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                    'transition-colors hover:bg-accent/50 hover:text-foreground'
                  )}
                  aria-expanded={expanded}
                >
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 shrink-0 transition-transform duration-200',
                      expanded && 'rotate-90'
                    )}
                  />
                  <span className="flex-1 text-left">
                    {t(section.titleKey as Parameters<typeof t>[0])}
                  </span>
                  <span className="text-[10px] font-normal tabular-nums opacity-60">
                    {section.items.length}
                  </span>
                </button>
              )}

              {/* Section items — animated accordion */}
              {compact ? (
                // Collapsed mode: always show all items (icon-only)
                <ul className="space-y-0.5" role="list">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <SidebarNavItem item={item} forceExpanded={forceExpanded} />
                    </li>
                  ))}
                </ul>
              ) : (
                // Expanded mode: animated accordion
                <div
                  className={cn(
                    'grid transition-[grid-template-rows] duration-200 ease-out',
                    expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  )}
                >
                  <div className="overflow-hidden">
                    <ul className="space-y-0.5 pt-0.5" role="list">
                      {section.items.map((item) => (
                        <li key={item.href}>
                          <SidebarNavItem item={item} forceExpanded={forceExpanded} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </ScrollArea>
  )
}

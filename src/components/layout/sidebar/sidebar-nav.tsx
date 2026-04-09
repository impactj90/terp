'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { ChevronRight, Star } from 'lucide-react'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuAction,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { usePermissionChecker } from '@/hooks/use-has-permission'
import { useModules } from '@/hooks/use-modules'
import { useSidebarExtras } from './sidebar-context'
import { navConfig, type NavSection, type NavItem } from './sidebar-nav-config'

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
 * Sidebar navigation content using shadcn sub-item pattern.
 * Each section becomes a collapsible parent with its items as indented sub-items.
 */
export function SidebarNav() {
  const {
    isSectionExpanded,
    toggleSection,
    favorites,
    isFavorite,
    addFavorite,
    removeFavorite,
  } = useSidebarExtras()
  const t = useTranslations('nav')
  const tSidebar = useTranslations('sidebar')
  const pathname = usePathname()
  const { check, isLoading } = usePermissionChecker()
  const { data: modulesData, isLoading: modulesLoading } = useModules()
  const { isMobile, setOpenMobile } = useSidebar()

  // On mobile, auto-close the sidebar sheet when a nav link is clicked.
  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false)
  }

  const enabledModules = useMemo(() => {
    if (!modulesData?.modules) return new Set<string>(['core'])
    return new Set<string>(modulesData.modules.map((m) => m.module))
  }, [modulesData])

  const visibleSections = useMemo(() => {
    if (isLoading || modulesLoading) return []
    return navConfig
      .map((section) => filterNavSection(section, check, enabledModules))
      .filter((section): section is NavSection => section !== null)
  }, [check, isLoading, modulesLoading, enabledModules])

  // Resolve favorite hrefs to actual NavItem objects
  const itemMap = useMemo(() => buildItemMap(visibleSections), [visibleSections])
  const favoriteItems = useMemo(
    () => favorites.map((href) => itemMap.get(href)).filter((item): item is NavItem => !!item),
    [favorites, itemMap]
  )

  // Check if any item in a section is active (for highlighting the parent)
  const isSectionActive = (section: NavSection) =>
    section.items.some((item) => {
      const segments = item.href.split('/').filter(Boolean)
      const prefixMatch = segments.length > 1 && pathname.startsWith(`${item.href}/`)
      return pathname === item.href || prefixMatch
    })

  const handleStarClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (isFavorite(href)) {
      removeFavorite(href)
    } else {
      addFavorite(href)
    }
  }

  const isItemActive = (item: NavItem, siblingHrefs: string[]) => {
    const segments = item.href.split('/').filter(Boolean)
    const prefixMatch = segments.length > 1 && pathname.startsWith(`${item.href}/`)
    const hasSiblingMatch = prefixMatch && siblingHrefs.some(
      (sibling) => sibling !== item.href && sibling.startsWith(`${item.href}/`) && pathname.startsWith(sibling)
    )
    return pathname === item.href || (prefixMatch && !hasSiblingMatch)
  }

  return (
    <SidebarContent>
      {/* Favorites section */}
      {favoriteItems.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel>
            <Star className="h-3 w-3 text-amber-500 fill-amber-500 mr-1.5" />
            {tSidebar('favorites')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {favoriteItems.map((item) => {
                const title = t(item.titleKey as Parameters<typeof t>[0])
                const active = isItemActive(item, [])
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={title}>
                      <Link href={item.href} prefetch={false} onClick={handleNavClick}>
                        <Icon />
                        <span>{title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {favoriteItems.length > 0 && <SidebarSeparator />}

      {/* Sections as collapsible menu items with sub-items */}
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {visibleSections.map((section) => {
              const sectionTitle = t(section.titleKey as Parameters<typeof t>[0])
              const sectionActive = isSectionActive(section)
              const SectionIcon = section.items[0]?.icon
              const siblingHrefs = section.items.map(i => i.href)

              return (
                <Collapsible
                  key={section.titleKey}
                  open={isSectionExpanded(section.titleKey)}
                  onOpenChange={() => toggleSection(section.titleKey)}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={sectionTitle} isActive={sectionActive}>
                        {SectionIcon && <SectionIcon />}
                        <span>{sectionTitle}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {section.items.map((item) => {
                          const title = t(item.titleKey as Parameters<typeof t>[0])
                          const active = isItemActive(item, siblingHrefs)
                          const starred = isFavorite(item.href)

                          return (
                            <SidebarMenuSubItem key={item.href} className="group/sub-item">
                              <SidebarMenuSubButton asChild isActive={active}>
                                <Link href={item.href} prefetch={false} onClick={handleNavClick}>
                                  <span>{title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                              {/* Favorite star on hover */}
                              <button
                                type="button"
                                onClick={(e) => handleStarClick(e, item.href)}
                                className={`absolute right-1 top-1 rounded p-0.5 transition-opacity ${
                                  starred
                                    ? 'text-amber-500 opacity-100'
                                    : 'opacity-0 text-muted-foreground hover:text-amber-500 group-hover/sub-item:opacity-100'
                                }`}
                                aria-label={starred ? 'Remove from favorites' : 'Add to favorites'}
                              >
                                <Star className={`h-3 w-3 ${starred ? 'fill-amber-500' : ''}`} />
                              </button>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}

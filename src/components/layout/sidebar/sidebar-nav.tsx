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
import {
  navConfig,
  filterNavSection,
  getAllSectionItems,
  type NavSection,
  type NavItem,
} from './sidebar-nav-config'

/**
 * Build a flat lookup from href → NavItem for resolving favorites.
 */
function buildItemMap(sections: NavSection[]): Map<string, NavItem> {
  const map = new Map<string, NavItem>()
  for (const section of sections) {
    for (const item of getAllSectionItems(section)) {
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

  const isAnyItemActive = (items: NavItem[]) =>
    items.some((item) => {
      const segments = item.href.split('/').filter(Boolean)
      const prefixMatch = segments.length > 1 && pathname.startsWith(`${item.href}/`)
      return pathname === item.href || prefixMatch
    })

  const isSectionActive = (section: NavSection) =>
    isAnyItemActive(getAllSectionItems(section))

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
              const allItems = getAllSectionItems(section)
              const SectionIcon = allItems[0]?.icon
              const allHrefs = allItems.map(i => i.href)

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
                      {section.subGroups && section.subGroups.length > 0 ? (
                        <SidebarMenuSub>
                          {section.subGroups.map((group) => {
                            const groupKey = `${section.titleKey}:${group.titleKey}`
                            const groupTitle = t(group.titleKey as Parameters<typeof t>[0])
                            const groupActive = isAnyItemActive(group.items)
                            const GroupIcon = group.icon

                            return (
                              <Collapsible
                                key={groupKey}
                                open={isSectionExpanded(groupKey)}
                                onOpenChange={() => toggleSection(groupKey)}
                                className="group/subgroup"
                              >
                                <SidebarMenuSubItem>
                                  <CollapsibleTrigger asChild>
                                    <SidebarMenuSubButton className={`h-auto min-h-7 cursor-pointer font-medium [&>span:last-child]:whitespace-normal ${groupActive ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground/70'}`}>
                                      <GroupIcon className="h-3.5 w-3.5 shrink-0" />
                                      <span>{groupTitle}</span>
                                      <ChevronRight className="ml-auto h-3 w-3 shrink-0 transition-transform duration-200 group-data-[state=open]/subgroup:rotate-90" />
                                    </SidebarMenuSubButton>
                                  </CollapsibleTrigger>
                                </SidebarMenuSubItem>
                                <CollapsibleContent>
                                  {group.items.map((item) => {
                                    const title = t(item.titleKey as Parameters<typeof t>[0])
                                    const active = isItemActive(item, allHrefs)
                                    const starred = isFavorite(item.href)

                                    return (
                                      <SidebarMenuSubItem key={item.href} className="group/sub-item">
                                        <SidebarMenuSubButton asChild isActive={active} size="sm">
                                          <Link href={item.href} prefetch={false} onClick={handleNavClick}>
                                            <span className="pl-5">{title}</span>
                                          </Link>
                                        </SidebarMenuSubButton>
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
                                </CollapsibleContent>
                              </Collapsible>
                            )
                          })}
                        </SidebarMenuSub>
                      ) : (
                        <SidebarMenuSub>
                          {section.items.map((item) => {
                            const title = t(item.titleKey as Parameters<typeof t>[0])
                            const active = isItemActive(item, allHrefs)
                            const starred = isFavorite(item.href)

                            return (
                              <SidebarMenuSubItem key={item.href} className="group/sub-item">
                                <SidebarMenuSubButton asChild isActive={active}>
                                  <Link href={item.href} prefetch={false} onClick={handleNavClick}>
                                    <span>{title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
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
                      )}
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

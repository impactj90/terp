// Main layout
export { AppLayout } from './app-layout'

// Sidebar
export {
  Sidebar,
  SidebarProvider,
  useSidebar,
  SidebarNav,
  SidebarNavItem,
  navConfig,
  mobileNavItems,
  type NavItem,
  type NavSection,
  type SidebarContextValue,
} from './sidebar'

// Header
export { Header } from './header'
export { UserMenu } from './user-menu'
export { Notifications } from './notifications'
export { TenantSelector } from './tenant-selector'

// Navigation
export { Breadcrumbs } from './breadcrumbs'
export { MobileNav } from './mobile-nav'
export { MobileSidebarSheet } from './mobile-sidebar-sheet'

// Accessibility
export { SkipLink } from './skip-link'

// Loading states
export { LoadingSkeleton } from './loading-skeleton'

// Layout primitives
export { Stack, HStack, VStack, type StackProps } from '@/components/ui/stack'
export { Container, type ContainerProps } from '@/components/ui/container'
export { Grid, GridItem, type GridProps, type GridItemProps } from '@/components/ui/grid'

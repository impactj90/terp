// Main layout
export { AppLayout } from './app-layout'

// Sidebar
export {
  AppSidebar,
  SidebarExtrasProvider,
  useSidebarExtras,
  SidebarNav,
  SidebarNavItem,
  navConfig,
  mobileNavItems,
  type NavItem,
  type NavSection,
  type SidebarExtrasContextValue,
} from './sidebar'

// Header
export { Header } from './header'
export { UserMenu } from './user-menu'
export { Notifications } from './notifications'
export { TenantSelector } from './tenant-selector'

// Navigation
export { Breadcrumbs } from './breadcrumbs'
export { MobileNav } from './mobile-nav'

// Accessibility
export { SkipLink } from './skip-link'

// Loading states
export { LoadingSkeleton } from './loading-skeleton'

// Demo lifecycle
export { DemoExpirationGate } from './demo-expiration-gate'
export { DemoBanner } from './demo-banner'

// Layout primitives
export { Stack, HStack, VStack, type StackProps } from '@/components/ui/stack'
export { Container, type ContainerProps } from '@/components/ui/container'
export { Grid, GridItem, type GridProps, type GridItemProps } from '@/components/ui/grid'

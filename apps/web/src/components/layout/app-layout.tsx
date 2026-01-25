'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { SidebarProvider, Sidebar, useSidebar } from './sidebar'
import { Header } from './header'
import { MobileNav } from './mobile-nav'
import { MobileSidebarSheet } from './mobile-sidebar-sheet'
import { Breadcrumbs } from './breadcrumbs'
import { SkipLink } from './skip-link'

interface AppLayoutContentProps {
  children: React.ReactNode
}

/**
 * Internal layout component that uses sidebar context.
 */
function AppLayoutContent({ children }: AppLayoutContentProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isCollapsed } = useSidebar()

  return (
    <>
      <SkipLink />

      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <Sidebar className="hidden lg:flex" />

        {/* Main content wrapper */}
        <div
          className={cn(
            'flex flex-1 flex-col transition-[margin] duration-300',
            // Add left margin on desktop to account for sidebar
            isCollapsed
              ? 'lg:ml-[var(--sidebar-collapsed-width)]'
              : 'lg:ml-[var(--sidebar-width)]'
          )}
        >
          {/* Header */}
          <Header onMobileMenuClick={() => setMobileMenuOpen(true)} />

          {/* Main content area */}
          <main
            id="main-content"
            className={cn(
              'flex-1 p-4 lg:p-6',
              // Add bottom padding on mobile for bottom nav
              'pb-[calc(var(--bottom-nav-height)+1rem)] lg:pb-6'
            )}
            tabIndex={-1}
          >
            <Breadcrumbs />
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <MobileNav
        className="lg:hidden"
        onMoreClick={() => setMobileMenuOpen(true)}
      />

      {/* Mobile sidebar sheet */}
      <MobileSidebarSheet
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
      />
    </>
  )
}

interface AppLayoutProps {
  children: React.ReactNode
  /** Initial sidebar collapsed state */
  defaultSidebarCollapsed?: boolean
}

/**
 * Main application layout wrapper.
 * Combines sidebar, header, mobile navigation, and main content area.
 *
 * @example
 * ```tsx
 * <AppLayout>
 *   <DashboardPage />
 * </AppLayout>
 * ```
 */
export function AppLayout({
  children,
  defaultSidebarCollapsed = false,
}: AppLayoutProps) {
  return (
    <SidebarProvider defaultCollapsed={defaultSidebarCollapsed}>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  )
}

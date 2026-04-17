'use client'

import { cn } from '@/lib/utils'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar, SidebarExtrasProvider } from './sidebar'
import { Header } from './header'
import { MobileNav } from './mobile-nav'
import { SkipLink } from './skip-link'
import { useGlobalNotifications } from '@/hooks/use-global-notifications'
import { useAuth } from '@/providers/auth-provider'
import { AiAssistantFab } from '@/components/ai-assistant'

interface AppLayoutProps {
  children: React.ReactNode
}

/**
 * Main application layout wrapper.
 * Uses shadcn SidebarProvider for sidebar state + SidebarExtrasProvider for favorites/sections.
 */
export function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated } = useAuth()
  useGlobalNotifications(isAuthenticated)

  return (
    <SidebarProvider>
      <SidebarExtrasProvider>
        <SkipLink />

        {/* Sidebar (desktop: collapsible sidebar, mobile: sheet overlay) */}
        <AppSidebar />

        {/* Main content area */}
        <SidebarInset className="min-w-0" id="main-content" tabIndex={-1}>
          {/* Header */}
          <Header />

          {/* Page content */}
          <div
            className={cn(
              'flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 lg:p-6',
              // Bottom padding for mobile nav + safe area
              'pb-[calc(var(--bottom-nav-height)+var(--safe-area-bottom)+1rem)] lg:pb-6'
            )}
          >
            {children}
          </div>
        </SidebarInset>

        {/* Mobile bottom navigation */}
        <MobileNav className="lg:hidden" />

        {/* AI Assistant */}
        {isAuthenticated && <AiAssistantFab />}
      </SidebarExtrasProvider>
    </SidebarProvider>
  )
}

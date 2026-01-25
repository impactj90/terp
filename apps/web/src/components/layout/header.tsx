'use client'

import { Menu, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { UserMenu } from './user-menu'
import { Notifications } from './notifications'
import { TenantSelector } from './tenant-selector'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface HeaderProps {
  className?: string
  /** Callback when mobile menu button is clicked */
  onMobileMenuClick?: () => void
}

/**
 * Fixed header component.
 * Contains mobile menu trigger, search, tenant selector, notifications, and user menu.
 */
export function Header({ className, onMobileMenuClick }: HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-[var(--header-height)] items-center gap-4 border-b bg-background px-4 lg:px-6',
        className
      )}
    >
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMobileMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>

      {/* Search (placeholder) - hidden on mobile */}
      <div className="hidden flex-1 md:flex md:max-w-md">
        <div className="relative w-full">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search..."
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Search"
          />
        </div>
      </div>

      {/* Spacer for mobile */}
      <div className="flex-1 md:hidden" />

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Tenant selector - hidden on mobile */}
        <div className="hidden md:block">
          <TenantSelector />
        </div>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <Notifications />

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  )
}

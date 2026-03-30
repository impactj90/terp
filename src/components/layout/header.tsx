'use client'

import { useTranslations } from 'next-intl'
import { CircleHelp, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { UserMenu } from './user-menu'
import { Notifications } from './notifications'
import { TenantSelector } from './tenant-selector'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { LocaleSwitcher } from './locale-switcher'
import { CommandMenu } from './command-menu'
import { Separator } from '@/components/ui/separator'

interface HeaderProps {
  className?: string
  /** Callback when mobile menu button is clicked */
  onMobileMenuClick?: () => void
}

/**
 * Fixed header component.
 * Contains mobile menu trigger, command palette search, tenant selector,
 * notifications, and user menu.
 */
export function Header({ className, onMobileMenuClick }: HeaderProps) {
  const t = useTranslations('header')

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-[var(--header-height)] items-center gap-3 border-b bg-background/95 backdrop-blur-sm px-4 lg:px-6',
        className
      )}
    >
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden shrink-0"
        onClick={onMobileMenuClick}
        aria-label={t('openMenu')}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>

      {/* Command menu search (trigger + dialog) */}
      <div className="flex-1 flex items-center min-w-0">
        <CommandMenu />
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-1">
        {/* Tenant selector - hidden on mobile */}
        <div className="hidden md:flex items-center">
          <TenantSelector />
        </div>

        <Separator orientation="vertical" className="hidden md:block mx-1.5 h-5" />

        {/* Compact action group */}
        <div className="flex items-center gap-0.5">
          <LocaleSwitcher />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            asChild
          >
            <a
              href="/hilfe"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('help')}
            >
              <CircleHelp className="h-4 w-4" />
            </a>
          </Button>

          <ThemeToggle />
        </div>

        <Separator orientation="vertical" className="mx-1.5 h-5" />

        {/* Notifications + User */}
        <div className="flex items-center gap-0.5">
          <Notifications />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

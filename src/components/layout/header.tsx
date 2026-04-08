'use client'

import { useTranslations } from 'next-intl'
import { CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Notifications } from './notifications'
import { TenantSelector } from './tenant-selector'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { LocaleSwitcher } from './locale-switcher'
import { CommandMenu } from './command-menu'

interface HeaderProps {
  className?: string
}

/**
 * Fixed header component.
 * User menu has moved to the sidebar footer.
 */
export function Header({ className }: HeaderProps) {
  const t = useTranslations('header')

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-[calc(var(--header-height)+var(--safe-area-top))] pt-[var(--safe-area-top)] items-center gap-3 border-b bg-background/95 backdrop-blur-sm px-4 lg:px-6',
        className
      )}
    >
      {/* Sidebar toggle (mobile: opens sheet, desktop: toggles collapsed) */}
      <SidebarTrigger className="shrink-0 min-h-9 min-w-9" />

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

          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent>{t('help')}</TooltipContent>
          </Tooltip>

          <ThemeToggle />
          <Notifications />
        </div>
      </div>
    </header>
  )
}

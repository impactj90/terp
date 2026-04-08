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
import { Breadcrumbs } from './breadcrumbs'

interface HeaderProps {
  className?: string
}

/**
 * Header component matching shadcn sidebar-07 pattern.
 * Left: SidebarTrigger | Separator | Breadcrumbs
 * Right: Search + compact actions
 */
export function Header({ className }: HeaderProps) {
  const t = useTranslations('header')

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12',
        className
      )}
    >
      {/* Left side: trigger + breadcrumbs */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumbs showHomeIcon={false} />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side: search + actions */}
      <div className="flex items-center gap-2">
        <div className="hidden md:flex">
          <CommandMenu />
        </div>

        <div className="hidden md:flex items-center">
          <TenantSelector />
        </div>

        <div className="flex items-center gap-0.5">
          <LocaleSwitcher />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
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

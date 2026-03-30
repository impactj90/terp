'use client'

import { useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { BookOpen, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { useSidebar } from './sidebar-context'
import { SidebarNav } from './sidebar-nav'

interface SidebarProps {
  className?: string
}

const HOVER_EXPAND_DELAY = 200

/**
 * Desktop sidebar component.
 * Fixed position with collapsible functionality and hover-expand overlay.
 */
export function Sidebar({ className }: SidebarProps) {
  const {
    isCollapsed,
    isHoverExpanded,
    setHoverExpanded,
    isCompact,
    toggle,
    expand,
  } = useSidebar()
  const t = useTranslations('sidebar')
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = useCallback(() => {
    if (!isCollapsed) return
    hoverTimer.current = setTimeout(() => {
      setHoverExpanded(true)
    }, HOVER_EXPAND_DELAY)
  }, [isCollapsed, setHoverExpanded])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setHoverExpanded(false)
  }, [setHoverExpanded])

  // In hover-expanded overlay mode, clicking the toggle pins the sidebar open
  const handleToggle = useCallback(() => {
    if (isHoverExpanded) {
      expand()
    } else {
      toggle()
    }
  }, [isHoverExpanded, expand, toggle])

  return (
    <TooltipProvider>
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'fixed inset-y-0 left-0 flex flex-col border-r bg-background transition-all duration-200 ease-out',
          // Width: compact (icon-only) vs expanded
          isCompact
            ? 'w-[var(--sidebar-collapsed-width)]'
            : 'w-[var(--sidebar-width)]',
          // Z-index and shadow: overlay mode gets elevated
          isHoverExpanded
            ? 'z-50 shadow-2xl ring-1 ring-border/50'
            : 'z-30',
          className
        )}
        aria-label="Main sidebar"
      >
        {/* Header with logo/branding */}
        <div
          className={cn(
            'flex h-[var(--header-height)] items-center border-b px-4',
            isCompact && 'justify-center px-2'
          )}
        >
          <Link
            href="/dashboard"
            className={cn(
              'flex items-center gap-2 font-semibold',
              isCompact && 'justify-center'
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-lg font-bold">T</span>
            </div>
            {!isCompact && (
              <span className="text-xl tracking-tight">Terp</span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <SidebarNav />

        {/* Help link */}
        <div className="border-t px-3 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href="/hilfe"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  isCompact && 'justify-center px-2'
                )}
              >
                <BookOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
                {!isCompact && <span>{t('help')}</span>}
              </a>
            </TooltipTrigger>
            {isCompact && (
              <TooltipContent side="right">{t('help')}</TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Collapse toggle button */}
        <div className="border-t p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggle}
                className={cn(
                  'w-full justify-start gap-2',
                  isCompact && 'justify-center px-2'
                )}
                aria-label={isCompact ? t('expand') : t('collapse')}
                aria-expanded={!isCompact}
              >
                {isCompact ? (
                  <PanelLeft className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                    <span>{isHoverExpanded ? t('pin') : t('collapse')}</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            {isCompact && (
              <TooltipContent side="right">{t('expand')}</TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}

'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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

/**
 * Desktop sidebar component.
 * Fixed position with collapsible functionality.
 */
export function Sidebar({ className }: SidebarProps) {
  const { isCollapsed, toggle } = useSidebar()

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex flex-col border-r bg-background transition-all duration-300',
          isCollapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
          className
        )}
        aria-label="Main sidebar"
      >
        {/* Header with logo/branding */}
        <div
          className={cn(
            'flex h-[var(--header-height)] items-center border-b px-4',
            isCollapsed && 'justify-center px-2'
          )}
        >
          <Link
            href="/dashboard"
            className={cn(
              'flex items-center gap-2 font-semibold',
              isCollapsed && 'justify-center'
            )}
          >
            {/* Logo placeholder - replace with actual logo */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-lg font-bold">T</span>
            </div>
            {!isCollapsed && (
              <span className="text-xl tracking-tight">Terp</span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <SidebarNav />

        {/* Collapse toggle button */}
        <div className="border-t p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggle}
                className={cn(
                  'w-full justify-start gap-2',
                  isCollapsed && 'justify-center px-2'
                )}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <>
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Collapse</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}

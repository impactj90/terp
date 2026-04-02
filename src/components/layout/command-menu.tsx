'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { navConfig, type NavSection } from './sidebar/sidebar-nav-config'
import { cn } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NavKey = any

/**
 * Command menu (⌘K) for quick navigation.
 * Searches all nav items from sidebar config grouped by section.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const locale = useLocale()
  const tNav = useTranslations('nav')
  const tHeader = useTranslations('header')

  // Toggle with ⌘K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(`/${locale}${href}`)
    },
    [router, locale]
  )

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'hidden md:flex items-center gap-2',
          'h-9 w-full max-w-[260px] rounded-lg',
          'border border-input bg-muted/40 px-3',
          'text-sm text-muted-foreground',
          'transition-colors hover:bg-muted/70 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left truncate">{tHeader('search')}</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      {/* Mobile search button */}
      <button
        onClick={() => setOpen(true)}
        className="flex md:hidden items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
        aria-label={tHeader('search')}
      >
        <Search className="h-5 w-5" />
      </button>

      {/* Command dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            'overflow-hidden p-0',
            // Mobile: top-aligned, override bottom-sheet default
            'top-[10%] bottom-auto max-h-[70vh] rounded-xl border',
            // Desktop: slightly higher
            'sm:top-[20%] sm:translate-y-0',
            'max-w-[540px]',
            'shadow-2xl',
            // Remove the default close button styles
            '[&>button:last-child]:hidden'
          )}
        >
          <DialogTitle className="sr-only">
            {tHeader('commandMenu')}
          </DialogTitle>
          <Command
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            loop
          >
            {/* Search input */}
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                placeholder={tHeader('commandSearchPlaceholder')}
                className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <Command.List className="max-h-[360px] overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                {tHeader('commandNoResults')}
              </Command.Empty>

              {navConfig.map((section: NavSection) => (
                <Command.Group
                  key={section.titleKey}
                  heading={tNav(section.titleKey as NavKey)}
                >
                  {section.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <Command.Item
                        key={item.href}
                        value={`${tNav(item.titleKey as NavKey)} ${item.href}`}
                        onSelect={() => handleSelect(item.href)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm cursor-pointer',
                          'aria-selected:bg-accent aria-selected:text-accent-foreground',
                          'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50'
                        )}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">
                            {tNav(item.titleKey as NavKey)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {tNav(section.titleKey as NavKey)}
                          </span>
                        </div>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              ))}
            </Command.List>

            {/* Footer with keyboard hints */}
            <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">↑</kbd>
                  <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">↓</kbd>
                  {tHeader('commandNavigate')}
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">↵</kbd>
                  {tHeader('commandSelect')}
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Esc</kbd>
                {tHeader('commandClose')}
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mobileNavItems } from './sidebar'

interface MobileNavProps {
  className?: string
  /** Callback when "More" button is clicked */
  onMoreClick?: () => void
}

/**
 * Fixed bottom tab bar for mobile devices.
 * Shows 4 primary navigation items plus "More" for full menu access.
 */
export function MobileNav({ className, onMoreClick }: MobileNavProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tCommon = useTranslations('common')

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex h-[var(--bottom-nav-height)] items-center justify-around border-t bg-background lg:hidden',
        className
      )}
      aria-label="Mobile navigation"
    >
      {mobileNavItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
              'hover:text-primary',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="truncate">{t(item.titleKey as Parameters<typeof t>[0])}</span>
          </Link>
        )
      })}

      {/* More button to open full navigation sheet */}
      <button
        type="button"
        onClick={onMoreClick}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium text-muted-foreground transition-colors',
          'hover:text-primary'
        )}
        aria-label={tCommon('more')}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        <span>{tCommon('more')}</span>
      </button>
    </nav>
  )
}

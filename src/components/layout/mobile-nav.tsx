'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/components/ui/sidebar'
import { mobileNavItems } from './sidebar'

interface MobileNavProps {
  className?: string
}

/**
 * Fixed bottom tab bar for mobile devices.
 * Shows 4 primary navigation items plus "More" for full menu access.
 */
export function MobileNav({ className }: MobileNavProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tCommon = useTranslations('common')
  const { setOpenMobile } = useSidebar()

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t bg-background lg:hidden',
        'h-[calc(var(--bottom-nav-height)+var(--safe-area-bottom))] pb-[var(--safe-area-bottom)]',
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
            prefetch={false}
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

      {/* More button to open sidebar sheet */}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
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

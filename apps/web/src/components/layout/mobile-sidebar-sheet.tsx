'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet'
import { SidebarNav } from './sidebar'
import { TenantSelector } from './tenant-selector'

interface MobileSidebarSheetProps {
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
}

/**
 * Mobile sidebar sheet component.
 * Full navigation drawer that slides in from the left.
 */
export function MobileSidebarSheet({
  open,
  onOpenChange,
}: MobileSidebarSheetProps) {
  const t = useTranslations('sidebar')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[280px] flex-col p-0"
        aria-label={t('navigationMenu')}
      >
        <SheetHeader className="flex h-[var(--header-height)] flex-row items-center justify-between border-b px-4">
          <SheetTitle asChild>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold"
              onClick={() => onOpenChange(false)}
            >
              {/* Logo placeholder */}
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-lg font-bold">T</span>
              </div>
              <span className="text-xl tracking-tight">Terp</span>
            </Link>
          </SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={t('closeMenu')}>
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetHeader>

        {/* Tenant selector for mobile */}
        <div className="border-b px-4 py-3">
          <TenantSelector className="w-full" />
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-hidden" onClick={() => onOpenChange(false)}>
          <SidebarNav />
        </div>

        {/* Footer with app info */}
        <div className="border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {t('appName')}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

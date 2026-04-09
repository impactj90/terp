'use client'

import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTenant } from '@/providers/tenant-provider'

interface TenantWithDemoFields {
  isDemo?: boolean
  demoExpiresAt?: string | Date | null
}

/**
 * Sticky informational banner shown inside the dashboard layout while a
 * demo tenant is still active. Does NOT redirect — the expiration
 * redirect is handled by DemoExpirationGate.
 */
export function DemoBanner() {
  const t = useTranslations('adminTenants')
  const { tenant } = useTenant()

  const daysRemaining = React.useMemo(() => {
    if (!tenant) return null
    const td = tenant as TenantWithDemoFields
    if (!td.isDemo) return null
    if (!td.demoExpiresAt) return null
    const expiresMs =
      typeof td.demoExpiresAt === 'string'
        ? Date.parse(td.demoExpiresAt)
        : td.demoExpiresAt.getTime()
    if (Number.isNaN(expiresMs)) return null
    const diffMs = expiresMs - Date.now()
    if (diffMs <= 0) return 0
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
  }, [tenant])

  if (daysRemaining === null || daysRemaining <= 0) return null

  return (
    <div className="sticky top-0 z-20 border-b border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-100">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-2 px-4 py-2 text-sm">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span>{t('demo.banner.message', { count: daysRemaining })}</span>
      </div>
    </div>
  )
}

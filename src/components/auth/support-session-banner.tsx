'use client'

import * as React from 'react'
import { LifeBuoy, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  useActiveSupportSession,
  useHasPermission,
  useRevokeSupportAccess,
} from '@/hooks'

interface ActiveSession {
  id: string
  reason: string
  expiresAt: string | Date
  platformUser?: { displayName: string; email: string } | null
}

/**
 * Sticky yellow banner rendered inside the dashboard layout whenever a
 * platform support operator has an active impersonation session against the
 * current tenant. Shown to ALL tenant users (not just admins) so the
 * presence of a support operator is never hidden.
 *
 * Only users with `platform.support_access.grant` see the inline
 * revoke-now button — regular users see the informational banner without
 * the action.
 */
export function SupportSessionBanner() {
  const t = useTranslations('adminSupportAccess')
  const { data } = useActiveSupportSession()
  const { allowed: canGrant } = useHasPermission([
    'platform.support_access.grant',
  ])
  const revokeMutation = useRevokeSupportAccess()

  const session = data as unknown as ActiveSession | null | undefined

  if (!session) return null

  const expiresAtMs =
    typeof session.expiresAt === 'string'
      ? Date.parse(session.expiresAt)
      : session.expiresAt.getTime()

  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    return null
  }

  const timeLabel = new Date(expiresAtMs).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const operatorLabel =
    session.platformUser?.displayName ?? t('operatorUnassigned')

  const handleRevoke = () => {
    revokeMutation.mutate({ id: session.id })
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-20 border-b border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-100"
    >
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-2 text-sm">
        <LifeBuoy className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          {t('bannerMessage', {
            time: timeLabel,
            operator: operatorLabel,
            reason: session.reason,
          })}
        </span>
        {canGrant && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-yellow-400 bg-yellow-50 text-yellow-900 hover:bg-yellow-200 dark:border-yellow-700 dark:bg-transparent dark:text-yellow-100 dark:hover:bg-yellow-900/40"
            disabled={revokeMutation.isPending}
            onClick={handleRevoke}
          >
            <X className="mr-1 h-3 w-3" />
            {t('bannerRevoke')}
          </Button>
        )}
      </div>
    </div>
  )
}

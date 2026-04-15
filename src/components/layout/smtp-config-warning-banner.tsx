'use client'

import Link from 'next/link'
import { Settings } from 'lucide-react'
import { usePermissionChecker } from '@/hooks/use-has-permission'
import { useSmtpConfigStatus } from '@/hooks/use-email-smtp-config'

/**
 * Sticky warning banner shown to admins when the current tenant has no
 * SMTP configuration. Regular (non-admin) users never see the banner —
 * they cannot fix the issue. Send-buttons across the app are already
 * disabled by `canSend` regardless of who is looking.
 */
export function SmtpConfigWarningBanner() {
  const { isAdmin, isLoading: permissionsLoading } = usePermissionChecker()
  const { isConfigured, isLoading: statusLoading } = useSmtpConfigStatus()

  if (permissionsLoading || statusLoading) return null
  if (!isAdmin) return null
  if (isConfigured !== false) return null

  return (
    <div
      role="status"
      className="sticky top-0 z-20 border-b border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-100"
    >
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-2 text-sm">
        <Settings className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          SMTP-Konfiguration fehlt — ohne SMTP-Zugangsdaten können keine
          E-Mails versendet werden (Rechnungen, Mahnungen, Einladungen).
        </span>
        <Link
          href="/admin/email-settings"
          className="underline underline-offset-2 hover:no-underline"
        >
          Jetzt einrichten
        </Link>
      </div>
    </div>
  )
}

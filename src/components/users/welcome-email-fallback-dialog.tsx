'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface WelcomeEmailFallbackDialogProps {
  /**
   * Recovery link to share manually. `null` → dialog closed.
   * Non-null string → dialog open with this link.
   */
  link: string | null
  onClose: () => void
}

/**
 * Fallback modal shown after a new user is created IF the welcome email
 * could not be delivered (no tenant SMTP configured or sendMail failed).
 * Presents the Supabase recovery link with a copy-to-clipboard button so
 * the admin can share it with the new user via their own channel
 * (chat, SMS, manual mail).
 *
 * When the welcome email succeeded, this dialog never opens — the admin
 * sees only a success toast from the parent page.
 */
export function WelcomeEmailFallbackDialog({
  link,
  onClose,
}: WelcomeEmailFallbackDialogProps) {
  const t = useTranslations('adminUsers')
  const open = link !== null

  const copyLink = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success(t('welcomeFallbackCopied'))
    } catch {
      toast.error(t('welcomeFallbackCopyFailed'))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('welcomeFallbackTitle')}</DialogTitle>
          <DialogDescription>
            {t('welcomeFallbackDescription')}
          </DialogDescription>
        </DialogHeader>

        {link && link.length > 0 ? (
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={link}
              className="font-mono text-xs"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyLink}
            >
              <Copy className="mr-2 h-4 w-4" />
              {t('welcomeFallbackCopyButton')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-destructive">
            {t('welcomeFallbackNoLink')}
          </p>
        )}

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t('welcomeFallbackClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

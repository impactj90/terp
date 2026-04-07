'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Paperclip, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useEmailContext, useSendEmail } from '@/hooks/use-email'

interface EmailComposeDialogProps {
  documentId: string
  documentType: string
  documentNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent?: () => void
}

export function EmailComposeDialog({
  documentId,
  documentType,
  documentNumber,
  open,
  onOpenChange,
  onSent,
}: EmailComposeDialogProps) {
  const t = useTranslations('emailCompose')
  const { data: context, isLoading: contextLoading } = useEmailContext(
    documentId,
    documentType
  )
  const sendMutation = useSendEmail()

  const [to, setTo] = React.useState('')
  const [cc, setCc] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [bodyHtml, setBodyHtml] = React.useState('')
  const [attachDefaults, setAttachDefaults] = React.useState(true)

  // Pre-fill when context loads
  React.useEffect(() => {
    if (context && open) {
      setTo(context.recipient ?? '')
      setSubject(context.subject ?? '')
      setBodyHtml(context.bodyHtml ?? '')
      setCc('')
      setAttachDefaults(true)
    }
  }, [context, open])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    try {
      const ccList = cc
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
      await sendMutation.mutateAsync({
        documentId,
        documentType,
        to,
        cc: ccList.length > 0 ? ccList : undefined,
        templateId: context?.templateId ?? undefined,
        subject,
        bodyHtml,
        attachDefaults,
      })
      toast.success(t('sendSuccess'))
      onOpenChange(false)
      onSent?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('no PDF') || message.includes('PDF file not found')) {
        toast.error(t('sendFailedNoPdf'))
      } else {
        toast.error(t('sendFailed'))
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('title')} — {documentNumber}
          </DialogTitle>
        </DialogHeader>

        {contextLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !context?.smtpConfigured ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('smtpNotConfigured')}{' '}
              <a
                href="/admin/email-settings"
                className="underline font-medium"
              >
                {t('smtpConfigureLink')}
              </a>
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSend} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-to">{t('fieldTo')}</Label>
              <Input
                id="email-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-cc">{t('fieldCc')}</Label>
              <Input
                id="email-cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder={t('fieldCcPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-subject">{t('fieldSubject')}</Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-body">{t('fieldBody')}</Label>
              <Textarea
                id="email-body"
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={8}
                required
              />
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <Label>{t('attachments')}</Label>
              <div className="space-y-1 text-sm">
                {context.pdfFileName && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>{context.pdfFileName}</span>
                  </div>
                )}
                {context.defaultAttachments.length > 0 && (
                  <div className="pt-1">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={attachDefaults}
                        onChange={(e) => setAttachDefaults(e.target.checked)}
                        className="rounded"
                      />
                      {t('attachDefaultFiles')} (
                      {context.defaultAttachments
                        .map((a) => a.fileName)
                        .join(', ')}
                      )
                    </label>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={sendMutation.isPending}>
                {sendMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('send')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

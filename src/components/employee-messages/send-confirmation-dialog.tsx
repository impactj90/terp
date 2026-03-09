'use client'

import * as React from 'react'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSendEmployeeMessage } from '@/hooks/api'

interface SendConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  messageId: string | null
  subject: string
  recipientCount: number
  onSendComplete?: () => void
}

interface SendResult {
  sent: number
  failed: number
}

export function SendConfirmationDialog({
  open,
  onOpenChange,
  messageId,
  subject,
  recipientCount,
  onSendComplete,
}: SendConfirmationDialogProps) {
  const t = useTranslations('adminEmployeeMessages')
  const [phase, setPhase] = React.useState<'confirm' | 'result'>('confirm')
  const [result, setResult] = React.useState<SendResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const sendMutation = useSendEmployeeMessage()

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setPhase('confirm')
      setResult(null)
      setError(null)
    }
  }, [open])

  const handleSend = async () => {
    if (!messageId) return
    setError(null)

    try {
      const response = await sendMutation.mutateAsync({
        path: { id: messageId },
      })

      setResult({
        sent: response.sent,
        failed: response.failed,
      })
      setPhase('result')
      onSendComplete?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('sendError'))
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {phase === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('sendConfirmTitle')}</DialogTitle>
              <DialogDescription>
                {t('sendConfirmDescription', { subject, count: recipientCount })}
              </DialogDescription>
            </DialogHeader>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={sendMutation.isPending}>
                {t('cancel')}
              </Button>
              <Button onClick={handleSend} disabled={sendMutation.isPending}>
                {sendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {sendMutation.isPending ? t('sending') : t('send')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('sendResultTitle')}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {result && result.sent > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>{t('sendResultSent', { count: result.sent })}</span>
                </div>
              )}
              {result && result.failed > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span>{t('sendResultFailed', { count: result.failed })}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>
                {t('done')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

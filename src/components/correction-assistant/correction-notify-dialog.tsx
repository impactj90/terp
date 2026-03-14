'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useCreateEmployeeMessage,
  useSendEmployeeMessage,
} from '@/hooks'
import type { CorrectionAssistantItem } from '@/hooks/use-correction-assistant'

interface CorrectionNotifyDialogProps {
  item: CorrectionAssistantItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDateDisplay(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

export function CorrectionNotifyDialog({
  item,
  open,
  onOpenChange,
}: CorrectionNotifyDialogProps) {
  const t = useTranslations('correctionAssistant')
  const [message, setMessage] = React.useState('')
  const createMessage = useCreateEmployeeMessage()
  const sendMessage = useSendEmployeeMessage()

  const isSending = createMessage.isPending || sendMessage.isPending

  // Build default message text when dialog opens or item changes
  React.useEffect(() => {
    if (item && open) {
      const dateDisplay = formatDateDisplay(item.valueDate)
      const errorDescriptions = item.errors
        .map((e) => `- ${e.customText || t(`errorCodes.${e.code}` as Parameters<typeof t>[0])}`)
        .join('\n')
      setMessage(
        t('notify.defaultMessage', {
          date: dateDisplay,
          errors: errorDescriptions,
        })
      )
    }
  }, [item, open, t])

  const handleSend = async () => {
    if (!item || !message.trim()) return

    try {
      const dateDisplay = formatDateDisplay(item.valueDate)
      const subject = t('notify.subject', { date: dateDisplay })

      // Step 1: Create the message with the employee as recipient
      const created = await createMessage.mutateAsync({
        subject,
        body: message.trim(),
        employeeIds: [item.employeeId],
      })

      // Step 2: Send it immediately
      await sendMessage.mutateAsync({ id: created.id })

      toast.success(t('notify.success', { name: item.employeeName }))
      onOpenChange(false)
    } catch {
      toast.error(t('notify.failed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('notify.title')}</DialogTitle>
          <DialogDescription>{t('notify.description')}</DialogDescription>
        </DialogHeader>

        {item && (
          <div className="space-y-4 py-4">
            {/* Read-only fields */}
            <div className="space-y-2">
              <Label>{t('detail.employee')}</Label>
              <Input value={item.employeeName} disabled />
            </div>

            <div className="space-y-2">
              <Label>{t('detail.date')}</Label>
              <Input value={formatDateDisplay(item.valueDate)} disabled />
            </div>

            {/* Editable message */}
            <div className="space-y-2">
              <Label htmlFor="notify-message">{t('notify.messageLabel')}</Label>
              <Textarea
                id="notify-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                disabled={isSending}
              />
              <p className="text-xs text-muted-foreground">
                {t('notify.messageHint')}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            {t('detail.close')}
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || !message.trim()}
          >
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSending ? t('notify.sending') : t('notify.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useSetInvoiceDunningBlock } from '@/hooks'
import { toast } from 'sonner'

interface DunningBlockCardProps {
  billingDocumentId: string
  initialBlocked: boolean
  initialReason: string | null
  disabled?: boolean
}

/**
 * Self-contained Mahnsperre toggle for a single invoice. Renders a card
 * with checkbox + reason textarea + save button. Calls
 * `billing.reminders.setInvoiceBlock` directly.
 */
export function DunningBlockCard({
  billingDocumentId,
  initialBlocked,
  initialReason,
  disabled,
}: DunningBlockCardProps) {
  const t = useTranslations('billingDunning')
  const mutation = useSetInvoiceDunningBlock()

  const [blocked, setBlocked] = React.useState(initialBlocked)
  const [reason, setReason] = React.useState(initialReason ?? '')
  const [dirty, setDirty] = React.useState(false)

  React.useEffect(() => {
    setBlocked(initialBlocked)
    setReason(initialReason ?? '')
    setDirty(false)
  }, [initialBlocked, initialReason])

  const handleBlockedChange = (next: boolean) => {
    setBlocked(next)
    setDirty(true)
  }

  const handleReasonChange = (next: string) => {
    setReason(next)
    setDirty(true)
  }

  const handleSave = async () => {
    try {
      await mutation.mutateAsync({
        billingDocumentId,
        blocked,
        reason: blocked ? reason.trim() || undefined : undefined,
      })
      toast.success(t('block.savedSuccess'))
      setDirty(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('block.saveError'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('block.invoiceTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2">
          <Checkbox
            id="invoice-dunning-blocked"
            checked={blocked}
            onCheckedChange={(v) => handleBlockedChange(v === true)}
            disabled={disabled || mutation.isPending}
          />
          <div className="space-y-1">
            <Label htmlFor="invoice-dunning-blocked" className="text-sm">
              {t('block.invoiceCheckbox')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('block.invoiceHint')}
            </p>
          </div>
        </div>

        {blocked && (
          <div className="space-y-2">
            <Label htmlFor="invoice-dunning-reason">
              {t('block.reasonLabel')}
            </Label>
            <Textarea
              id="invoice-dunning-reason"
              value={reason}
              onChange={(e) => handleReasonChange(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={disabled || mutation.isPending}
            />
          </div>
        )}

        {dirty && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={mutation.isPending || disabled}
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {t('block.save')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

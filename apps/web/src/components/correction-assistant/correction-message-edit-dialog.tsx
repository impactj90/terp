'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  CorrectionMessage,
  UpdateCorrectionMessageRequest,
} from '@/hooks/api/use-correction-assistant'

interface CorrectionMessageEditDialogProps {
  message: CorrectionMessage | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (id: string, data: UpdateCorrectionMessageRequest) => Promise<void>
  isUpdating: boolean
}

export function CorrectionMessageEditDialog({
  message,
  open,
  onOpenChange,
  onUpdate,
  isUpdating,
}: CorrectionMessageEditDialogProps) {
  const t = useTranslations('correctionAssistant')
  const [customText, setCustomText] = React.useState('')
  const [severity, setSeverity] = React.useState<'error' | 'hint'>('error')
  const [isActive, setIsActive] = React.useState(true)

  React.useEffect(() => {
    if (message && open) {
      setCustomText(message.custom_text ?? '')
      setSeverity(message.severity)
      setIsActive(message.is_active)
    }
  }, [message, open])

  const handleSave = async () => {
    if (!message) return
    await onUpdate(message.id, {
      custom_text: customText.trim() || null,
      severity,
      is_active: isActive,
    })
    onOpenChange(false)
  }

  const handleResetToDefault = async () => {
    if (!message) return
    await onUpdate(message.id, { custom_text: null })
    setCustomText('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('messages.editMessage')}</DialogTitle>
          <DialogDescription>
            {message?.code ? `${t('messages.editMessageDescription')} (${message.code})` : t('messages.editMessageDescription')}
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="custom-text">{t('messages.customText')}</Label>
              <Textarea
                id="custom-text"
                placeholder={t('messages.customTextPlaceholder')}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {t('messages.customTextHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('messages.severityLabel')}</Label>
              <Select value={severity} onValueChange={(value) => setSeverity(value as 'error' | 'hint')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="error">{t('severity.error')}</SelectItem>
                  <SelectItem value="hint">{t('severity.hint')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="active-toggle">{t('messages.activeLabel')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('messages.activeDescription')}
                </p>
              </div>
              <Switch
                id="active-toggle"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={handleResetToDefault}
            disabled={isUpdating}
            className="sm:mr-auto"
          >
            {t('messages.resetToDefault')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('messages.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isUpdating}>
            {isUpdating ? t('messages.saving') : t('messages.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

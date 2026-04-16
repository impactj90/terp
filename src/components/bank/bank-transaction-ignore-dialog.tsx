'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason?: string) => void
  isLoading?: boolean
}

export function BankTransactionIgnoreDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: Props) {
  const t = useTranslations('bankInbox')
  const [reason, setReason] = React.useState('')

  const handleConfirm = () => {
    onConfirm(reason.trim() || undefined)
    setReason('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ignoreDialog.title')}</DialogTitle>
          <DialogDescription>{t('ignoreDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="ignore-reason">{t('ignoreDialog.reasonLabel')}</Label>
          <Textarea
            id="ignore-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('ignoreDialog.reasonPlaceholder')}
            maxLength={500}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t('footer.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('ignoreDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

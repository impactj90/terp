'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface RejectDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Title displayed in the dialog header */
  title: string
  /** Description displayed under the title */
  description: string
  /** Whether the rejection is in progress */
  isLoading?: boolean
  /** Callback when confirm is clicked with the entered reason */
  onConfirm: (reason: string) => void | Promise<void>
}

/**
 * Dialog for rejecting an absence request with an optional reason.
 */
export function RejectDialog({
  open,
  onOpenChange,
  title,
  description,
  isLoading = false,
  onConfirm,
}: RejectDialogProps) {
  const t = useTranslations('adminApprovals')
  const [reason, setReason] = React.useState('')

  // Reset reason when dialog closes
  React.useEffect(() => {
    if (!open) {
      setReason('')
    }
  }, [open])

  const handleConfirm = async () => {
    await onConfirm(reason)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Textarea
            placeholder={t('reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            disabled={isLoading}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

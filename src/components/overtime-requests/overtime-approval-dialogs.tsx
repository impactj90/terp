'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ApproveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  arbzgWarnings: string[]
  isLoading: boolean
  onConfirm: (arbzgOverrideReason?: string) => void
}

export function ApproveOvertimeDialog({
  open,
  onOpenChange,
  arbzgWarnings,
  isLoading,
  onConfirm,
}: ApproveDialogProps) {
  const t = useTranslations('overtime_requests')
  const tArbZG = useTranslations('overtime_requests.arbzg')
  const tQueue = useTranslations('overtime_requests.approver.queue')

  const [override, setOverride] = React.useState('')

  React.useEffect(() => {
    if (open) setOverride('')
  }, [open])

  const needsOverride = arbzgWarnings.length > 0
  const canSubmit =
    !needsOverride || (needsOverride && override.trim().length >= 2)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tQueue('approve')}</DialogTitle>
          <DialogDescription>{t('detail.arbzgWarnings')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {needsOverride ? (
            <Alert>
              <AlertTitle>{t('detail.arbzgWarnings')}</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-disc pl-4 text-sm">
                  {arbzgWarnings.map((w) => (
                    <li key={w}>
                      {tArbZG(w as 'DAILY_MAX_EXCEEDED')}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {needsOverride ? (
            <div className="space-y-2">
              <Label htmlFor="ot-override">
                {tArbZG('overrideReasonLabel')}
              </Label>
              <Textarea
                id="ot-override"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                placeholder={tArbZG('overrideReasonPlaceholder')}
                rows={3}
              />
              {!override.trim() ? (
                <p className="text-xs text-muted-foreground">
                  {tArbZG('overrideRequired')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('detail.close')}
          </Button>
          <Button
            disabled={!canSubmit || isLoading}
            onClick={() =>
              onConfirm(needsOverride ? override.trim() : undefined)
            }
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {tQueue('approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface RejectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isLoading: boolean
  onConfirm: (reason: string) => void
}

export function RejectOvertimeDialog({
  open,
  onOpenChange,
  isLoading,
  onConfirm,
}: RejectDialogProps) {
  const tQueue = useTranslations('overtime_requests.approver.queue')
  const tDetail = useTranslations('overtime_requests.detail')
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (open) setReason('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tQueue('rejectDialogTitle')}</DialogTitle>
          <DialogDescription>
            {tQueue('rejectDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="ot-reject-reason">
            {tQueue('rejectReasonLabel')}
          </Label>
          <Textarea
            id="ot-reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tDetail('close')}
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 2 || isLoading}
            onClick={() => onConfirm(reason.trim())}
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {tQueue('reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

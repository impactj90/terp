'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useCreateOvertimeRequest,
  useOvertimeRequestConfigPublic,
} from '@/hooks'

interface OvertimeRequestFormProps {
  employeeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

function todayISO(): string {
  const now = new Date()
  const iso = now.toISOString().split('T')[0]!
  return iso
}

export function OvertimeRequestForm({
  employeeId,
  open,
  onOpenChange,
  onSuccess,
}: OvertimeRequestFormProps) {
  const t = useTranslations('overtime_requests.form')
  const tToast = useTranslations('overtime_requests.toast')
  const create = useCreateOvertimeRequest()
  const { data: policy } = useOvertimeRequestConfigPublic()
  const reopenAllowed = policy?.reopenRequired !== false

  const [requestType, setRequestType] = React.useState<'PLANNED' | 'REOPEN'>(
    'PLANNED'
  )
  const [requestDate, setRequestDate] = React.useState(todayISO())
  const [plannedMinutes, setPlannedMinutes] = React.useState('60')
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setRequestType('PLANNED')
    setRequestDate(todayISO())
    setPlannedMinutes('60')
    setReason('')
  }, [open])

  // If the reopen policy flips to disabled while the dialog is open, snap
  // back to PLANNED so submit doesn't hit a 400 from the service.
  React.useEffect(() => {
    if (!reopenAllowed && requestType === 'REOPEN') {
      setRequestType('PLANNED')
    }
  }, [reopenAllowed, requestType])

  const handleSubmit = async () => {
    try {
      await create.mutateAsync({
        employeeId,
        requestType,
        requestDate,
        plannedMinutes: Math.max(1, Number(plannedMinutes) || 0),
        reason: reason.trim(),
      })
      toast.success(tToast('submitted'))
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : tToast('actionFailed')
      )
    }
  }

  const canSubmit =
    Number(plannedMinutes) > 0 && reason.trim().length >= 2 && !!requestDate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>{t('requestType.label')}</Label>
            <RadioGroup
              value={requestType}
              onValueChange={(v) => setRequestType(v as 'PLANNED' | 'REOPEN')}
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem id="rt-planned" value="PLANNED" className="mt-1" />
                <div>
                  <Label htmlFor="rt-planned" className="font-medium">
                    {t('requestType.planned')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('requestType.plannedHint')}
                  </p>
                </div>
              </div>
              {reopenAllowed ? (
                <div className="flex items-start gap-2">
                  <RadioGroupItem id="rt-reopen" value="REOPEN" className="mt-1" />
                  <div>
                    <Label htmlFor="rt-reopen" className="font-medium">
                      {t('requestType.reopen')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('requestType.reopenHint')}
                    </p>
                  </div>
                </div>
              ) : null}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ot-date">{t('requestDate.label')}</Label>
            <Input
              id="ot-date"
              type="date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ot-minutes">{t('plannedMinutes.label')}</Label>
            <Input
              id="ot-minutes"
              type="number"
              min={1}
              value={plannedMinutes}
              onChange={(e) => setPlannedMinutes(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('plannedMinutes.hint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ot-reason">{t('reason.label')}</Label>
            <Textarea
              id="ot-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reason.placeholder')}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || create.isPending}
          >
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {create.isPending ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

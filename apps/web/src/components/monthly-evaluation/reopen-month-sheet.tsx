'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Unlock, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useReopenMonth } from '@/hooks/api'

interface ReopenMonthSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId?: string
  year: number
  month: number
  monthLabel: string
}

export function ReopenMonthSheet({
  open,
  onOpenChange,
  employeeId,
  year,
  month,
  monthLabel,
}: ReopenMonthSheetProps) {
  const t = useTranslations('monthlyEvaluation')
  const tc = useTranslations('common')

  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reopenMutation = useReopenMonth()

  const handleClose = () => {
    setReason('')
    setError(null)
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!employeeId) return

    if (reason.trim().length < 10) {
      setError(t('reasonTooShort'))
      return
    }

    setError(null)

    try {
      await reopenMutation.mutateAsync({
        employeeId,
        year,
        month,
      })
      handleClose()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('failedToReopen'))
    }
  }

  const isValid = reason.trim().length >= 10

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5" />
            {t('reopenMonth')}
          </SheetTitle>
          <SheetDescription>
            {t('reopenDescription', { month: monthLabel })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 py-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('reopenWarning')}
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="reason">
              {t('reasonLabel')} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder={t('reasonPlaceholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className={!isValid && reason.length > 0 ? 'border-destructive' : ''}
            />
            <p className="text-xs text-muted-foreground">
              {t('minCharacters', { count: reason.length })}
            </p>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={reopenMutation.isPending}
            className="flex-1"
          >
            {tc('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={reopenMutation.isPending || !isValid || !employeeId}
            className="flex-1"
          >
            {reopenMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('reopenMonth')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

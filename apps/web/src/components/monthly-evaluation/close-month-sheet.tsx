'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Lock, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useCloseMonth } from '@/hooks/api'

interface CloseMonthSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId?: string
  year: number
  month: number
  monthLabel: string
}

export function CloseMonthSheet({
  open,
  onOpenChange,
  employeeId,
  year,
  month,
  monthLabel,
}: CloseMonthSheetProps) {
  const t = useTranslations('monthlyEvaluation')
  const tc = useTranslations('common')

  const [recalculate, setRecalculate] = useState(true)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const closeMutation = useCloseMonth()

  const handleClose = () => {
    setRecalculate(true)
    setNotes('')
    setError(null)
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!employeeId) return

    setError(null)

    try {
      await closeMutation.mutateAsync({
        employeeId,
        year,
        month,
      })
      handleClose()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('failedToClose'))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {t('closeMonth')}
          </SheetTitle>
          <SheetDescription>
            {t('closeDescription', { monthLabel })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 py-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-start space-x-3">
            <Checkbox
              id="recalculate"
              checked={recalculate}
              onCheckedChange={(checked) => setRecalculate(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="recalculate" className="cursor-pointer">
                {t('recalculateBeforeClosing')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('recalculateDescription')}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('notesOptional')}</Label>
            <Textarea
              id="notes"
              placeholder={t('closingNotesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h4 className="font-medium text-sm">{t('whatHappens')}</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex items-center gap-2">
                <RefreshCw className="h-3 w-3" />
                {recalculate ? t('willRecalculate') : t('willNotRecalculate')}
              </li>
              <li>{t('entriesLocked')}</li>
              <li>{t('totalsFinalized')}</li>
              <li>{t('adminCanReopen')}</li>
            </ul>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={closeMutation.isPending}
            className="flex-1"
          >
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={closeMutation.isPending || !employeeId}
            className="flex-1"
          >
            {closeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('closeMonth')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

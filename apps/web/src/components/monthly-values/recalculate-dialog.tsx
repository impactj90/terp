'use client'

import * as React from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw, Loader2, Info } from 'lucide-react'
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
import { useRecalculateMonthlyValues } from '@/hooks/api'

interface RecalculateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  month: number
  monthLabel: string
}

export function RecalculateDialog({
  open,
  onOpenChange,
  year,
  month,
  monthLabel,
}: RecalculateDialogProps) {
  const t = useTranslations('monthlyValues')
  const tc = useTranslations('common')

  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const recalculateMutation = useRecalculateMonthlyValues()

  const handleClose = () => {
    setError(null)
    setSuccessMessage(null)
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await recalculateMutation.mutateAsync({
        body: { year, month },
      })
      setSuccessMessage(
        t('recalculate.success', { count: result.affected_employees ?? 0 })
      )
      // Auto-close after a short delay
      setTimeout(() => {
        handleClose()
      }, 2000)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Failed to recalculate')
    }
  }

  return (
    <Dialog open={open} onOpenChange={recalculateMutation.isPending ? undefined : handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {t('recalculate.title')}
          </DialogTitle>
          <DialogDescription>
            {t('recalculate.description', { monthLabel })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert>
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {!successMessage && (
            <div className="rounded-lg bg-muted p-4 flex items-start gap-3">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">{t('recalculate.info')}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {!successMessage ? (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={recalculateMutation.isPending}
              >
                {tc('cancel')}
              </Button>
              <Button onClick={handleSubmit} disabled={recalculateMutation.isPending}>
                {recalculateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('recalculate.confirm')}
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t('recalculate.refreshHint')}</p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useInitializeVacationBalances } from '@/hooks/api'

interface InitializeYearDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function InitializeYearDialog({
  open,
  onOpenChange,
  onSuccess,
}: InitializeYearDialogProps) {
  const t = useTranslations('adminVacationBalances')
  const tCommon = useTranslations('common')

  const [year, setYear] = React.useState(new Date().getFullYear())
  const [carryover, setCarryover] = React.useState(true)
  const [result, setResult] = React.useState<{ message: string; createdCount: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const initializeMutation = useInitializeVacationBalances()

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setYear(new Date().getFullYear())
      setCarryover(true)
      setResult(null)
      setError(null)
    }
  }, [open])

  const handleSubmit = async () => {
    setError(null)
    setResult(null)

    try {
      const response = await initializeMutation.mutateAsync({
        body: { year, carryover },
      })
      const data = response as { message?: string; created_count?: number }
      setResult({
        message: data.message ?? '',
        createdCount: data.created_count ?? 0,
      })
      // Auto-close after brief delay
      setTimeout(() => {
        onOpenChange(false)
        onSuccess?.()
      }, 2000)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('initializeError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('initializeTitle')}</DialogTitle>
          <DialogDescription>{t('initializeDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Year */}
          <div className="space-y-2">
            <Label htmlFor="initYear">{t('initializeYear')}</Label>
            <Input
              id="initYear"
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
              disabled={initializeMutation.isPending}
            />
          </div>

          {/* Carryover checkbox */}
          <div className="flex items-center gap-3">
            <Checkbox
              id="carryover"
              checked={carryover}
              onCheckedChange={(checked) => setCarryover(checked === true)}
              disabled={initializeMutation.isPending}
            />
            <Label htmlFor="carryover" className="text-sm font-normal cursor-pointer">
              {t('initializeCarryover')}
            </Label>
          </div>

          {/* Info */}
          <Alert>
            <AlertDescription>
              {t('initializeInfo', { year })}
            </AlertDescription>
          </Alert>

          {/* Result */}
          {result && (
            <Alert>
              <AlertDescription>
                {t('initializeSuccess', { count: result.createdCount, year })}
              </AlertDescription>
            </Alert>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={initializeMutation.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={initializeMutation.isPending}
          >
            {initializeMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('initializeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCopyHolidays } from '@/hooks/api'

interface HolidayCopyDialogProps {
  open: boolean
  targetYear: number
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function HolidayCopyDialog({
  open,
  targetYear,
  onOpenChange,
  onSuccess,
}: HolidayCopyDialogProps) {
  const t = useTranslations('adminHolidays')
  const [sourceYear, setSourceYear] = React.useState(targetYear - 1)
  const [destinationYear, setDestinationYear] = React.useState(targetYear)
  const [overrideDec24, setOverrideDec24] = React.useState(false)
  const [overrideDec31, setOverrideDec31] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const copyMutation = useCopyHolidays()

  React.useEffect(() => {
    if (open) {
      setSourceYear(targetYear - 1)
      setDestinationYear(targetYear)
      setOverrideDec24(false)
      setOverrideDec31(false)
      setError(null)
    }
  }, [open, targetYear])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!sourceYear || Number.isNaN(sourceYear)) {
      setError(t('validationSourceYearRequired'))
      return
    }
    if (!destinationYear || Number.isNaN(destinationYear)) {
      setError(t('validationTargetYearRequired'))
      return
    }

    const overrides: { month: number; day: number; category: number }[] = []
    if (overrideDec24) {
      overrides.push({ month: 12, day: 24, category: 2 })
    }
    if (overrideDec31) {
      overrides.push({ month: 12, day: 31, category: 2 })
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (copyMutation as any).mutateAsync({
        body: {
          source_year: sourceYear,
          target_year: destinationYear,
          category_overrides: overrides.length > 0 ? overrides : undefined,
        },
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('errorCopyFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('copyTitle')}</DialogTitle>
          <DialogDescription>{t('copyDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sourceYear">{t('sourceYearLabel')} *</Label>
              <Input
                id="sourceYear"
                type="number"
                value={sourceYear}
                onChange={(e) => setSourceYear(Number(e.target.value))}
                min={1900}
                max={2200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetYear">{t('targetYearLabel')} *</Label>
              <Input
                id="targetYear"
                type="number"
                value={destinationYear}
                onChange={(e) => setDestinationYear(Number(e.target.value))}
                min={1900}
                max={2200}
              />
            </div>

            <div className="space-y-3">
              <Label>{t('overrideLabel')}</Label>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">{t('overrideDec24Label')}</span>
                  <p className="text-xs text-muted-foreground">{t('overrideDec24Hint')}</p>
                </div>
                <Switch checked={overrideDec24} onCheckedChange={setOverrideDec24} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">{t('overrideDec31Label')}</span>
                  <p className="text-xs text-muted-foreground">{t('overrideDec31Hint')}</p>
                </div>
                <Switch checked={overrideDec31} onCheckedChange={setOverrideDec31} />
              </div>
            </div>

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
              disabled={copyMutation.isPending}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={copyMutation.isPending}>
              {copyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('copyButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

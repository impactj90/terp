'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { useGenerateHolidays } from '@/hooks/api'

interface HolidayGenerateDialogProps {
  open: boolean
  year: number
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const STATES = [
  { code: 'BW', label: 'Baden-Wuerttemberg' },
  { code: 'BY', label: 'Bayern' },
  { code: 'BE', label: 'Berlin' },
  { code: 'BB', label: 'Brandenburg' },
  { code: 'HB', label: 'Bremen' },
  { code: 'HH', label: 'Hamburg' },
  { code: 'HE', label: 'Hessen' },
  { code: 'MV', label: 'Mecklenburg-Vorpommern' },
  { code: 'NI', label: 'Niedersachsen' },
  { code: 'NW', label: 'Nordrhein-Westfalen' },
  { code: 'RP', label: 'Rheinland-Pfalz' },
  { code: 'SL', label: 'Saarland' },
  { code: 'SN', label: 'Sachsen' },
  { code: 'ST', label: 'Sachsen-Anhalt' },
  { code: 'SH', label: 'Schleswig-Holstein' },
  { code: 'TH', label: 'Thueringen' },
]

export function HolidayGenerateDialog({
  open,
  year,
  onOpenChange,
  onSuccess,
}: HolidayGenerateDialogProps) {
  const t = useTranslations('adminHolidays')
  const [selectedYear, setSelectedYear] = React.useState(year)
  const [state, setState] = React.useState('BY')
  const [error, setError] = React.useState<string | null>(null)

  const generateMutation = useGenerateHolidays()

  React.useEffect(() => {
    if (open) {
      setSelectedYear(year)
      setState('BY')
      setError(null)
    }
  }, [open, year])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedYear || Number.isNaN(selectedYear)) {
      setError(t('validationYearRequired'))
      return
    }
    if (!state) {
      setError(t('validationStateRequired'))
      return
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (generateMutation as any).mutateAsync({
        body: {
          year: selectedYear,
          state,
        },
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('errorGenerateFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('generateTitle')}</DialogTitle>
          <DialogDescription>{t('generateDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="generateYear">{t('yearLabel')} *</Label>
              <Input
                id="generateYear"
                type="number"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                min={1900}
                max={2200}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('stateLabel')} *</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger>
                  <SelectValue placeholder={t('statePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {STATES.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              disabled={generateMutation.isPending}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={generateMutation.isPending}>
              {generateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('generateButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

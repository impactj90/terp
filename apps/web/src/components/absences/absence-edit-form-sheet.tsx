'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useUpdateAbsence } from '@/hooks/api'
import { parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Absence = components['schemas']['Absence']

interface AbsenceEditFormSheetProps {
  absence: Absence | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-2 border-b last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '-'}</span>
    </div>
  )
}

export function AbsenceEditFormSheet({
  absence,
  open,
  onOpenChange,
  onSuccess,
}: AbsenceEditFormSheetProps) {
  const [duration, setDuration] = React.useState<'1' | '0.5'>('1')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const t = useTranslations('absences')
  const tc = useTranslations('common')
  const locale = useLocale()

  const updateMutation = useUpdateAbsence()

  // Reset form when opening or absence changes
  React.useEffect(() => {
    if (open && absence) {
      setDuration(absence.duration === 0.5 ? '0.5' : '1')
      setNotes(absence.notes ?? '')
      setError(null)
    }
  }, [open, absence])

  const status = absence?.status ?? 'pending'
  const isPending = status === 'pending'

  const formattedDate = absence
    ? parseISODate(absence.absence_date).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  const handleSubmit = async () => {
    if (!absence) return
    setError(null)

    try {
      const body: Record<string, unknown> = {}

      // Only send duration if status is pending and value changed
      if (isPending) {
        const newDuration = duration === '0.5' ? 0.5 : 1
        if (newDuration !== absence.duration) {
          body.duration = newDuration
        }
      }

      // Send notes if changed
      const newNotes = notes.trim()
      if (newNotes !== (absence.notes ?? '')) {
        body.notes = newNotes
      }

      // Only call API if something changed
      if (Object.keys(body).length === 0) {
        onOpenChange(false)
        return
      }

      await updateMutation.mutateAsync({
        path: { id: absence.id },
        body,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('failedToUpdate'))
    }
  }

  const isSubmitting = updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('editAbsence')}</SheetTitle>
          <SheetDescription>{t('editDescription')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Read-only info section */}
            <div className="rounded-lg border p-4">
              <DetailRow
                label={t('typeLabel')}
                value={
                  <div className="flex items-center gap-2">
                    {absence?.absence_type?.color && (
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: absence.absence_type.color }}
                      />
                    )}
                    <span>{absence?.absence_type?.name ?? t('unknownType')}</span>
                  </div>
                }
              />
              <DetailRow label={t('dateLabel')} value={formattedDate} />
              <DetailRow
                label={t('statusLabel')}
                value={
                  <Badge
                    variant={
                      status === 'pending'
                        ? 'secondary'
                        : status === 'approved'
                          ? 'default'
                          : 'outline'
                    }
                  >
                    {status === 'pending'
                      ? t('statusPending')
                      : status === 'approved'
                        ? t('statusApproved')
                        : status}
                  </Badge>
                }
              />
            </div>

            {/* Duration field */}
            <div className="space-y-3">
              <Label className="text-base">{t('duration')}</Label>
              {isPending ? (
                <RadioGroup
                  value={duration}
                  onValueChange={(value) => setDuration(value as '1' | '0.5')}
                  disabled={isSubmitting}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1" id="edit-full-day" />
                    <Label htmlFor="edit-full-day" className="font-normal">
                      {t('fullDay')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="0.5" id="edit-half-day" />
                    <Label htmlFor="edit-half-day" className="font-normal">
                      {t('halfDay')}
                    </Label>
                  </div>
                </RadioGroup>
              ) : (
                <div className="space-y-2">
                  <Badge variant="outline">
                    {absence?.duration === 0.5 ? t('halfDay') : t('fullDay')}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {t('durationLockedApproved')}
                  </p>
                </div>
              )}
            </div>

            {/* Notes field */}
            <div className="space-y-3">
              <Label htmlFor="edit-notes" className="text-base">
                {t('notesLabel')}{' '}
                <span className="text-muted-foreground font-normal">
                  ({t('optional')})
                </span>
              </Label>
              <Textarea
                id="edit-notes"
                placeholder={t('notesPlaceholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? tc('saving') : tc('saveChanges')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

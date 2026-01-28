'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useUpdateBooking } from '@/hooks/api'

interface Booking {
  id: string
  booking_date: string
  booking_type?: { code: string; name: string; direction: 'in' | 'out' } | null
  original_time: number
  edited_time: number
  calculated_time?: number | null
  notes?: string | null
}

interface BookingEditDialogProps {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

/**
 * Convert minutes from midnight to HH:MM format.
 */
function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}


export function BookingEditDialog({
  booking,
  open,
  onOpenChange,
  onSuccess,
}: BookingEditDialogProps) {
  const t = useTranslations('timesheet')
  const tc = useTranslations('common')
  const [editedTime, setEditedTime] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const updateBooking = useUpdateBooking()

  // Initialize form when booking changes
  useEffect(() => {
    if (booking) {
      setEditedTime(minutesToTimeString(booking.edited_time))
      setNotes(booking.notes ?? '')
      setError(null)
    }
  }, [booking])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!booking) return

    setError(null)

    try {
      // Validate time format
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/
      if (!timeRegex.test(editedTime)) {
        setError(t('invalidTimeFormat'))
        return
      }

      await updateBooking.mutateAsync({
        path: { id: booking.id },
        body: {
          time: editedTime,
          notes: notes || undefined,
        },
      } as never)

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToUpdate'))
    }
  }

  if (!booking) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('editBooking')}</SheetTitle>
          <SheetDescription>
            {t('bookingOnDate', { type: booking.booking_type?.name ?? 'Booking', date: booking.booking_date })}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="ml-2">{error}</span>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>{t('originalTime')}</Label>
            <Input
              value={minutesToTimeString(booking.original_time)}
              disabled
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t('originalTimeHelp')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editedTime">{t('editedTime')}</Label>
            <Input
              id="editedTime"
              value={editedTime}
              onChange={(e) => setEditedTime(e.target.value)}
              placeholder="HH:MM"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t('editedTimeHelp')}
            </p>
          </div>

          {booking.calculated_time !== undefined && booking.calculated_time !== null && (
            <div className="space-y-2">
              <Label>{t('calculatedTime')}</Label>
              <Input
                value={minutesToTimeString(booking.calculated_time)}
                disabled
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t('calculatedTimeHelp')}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">{t('notes')}</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('optionalNotes')}
            />
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={updateBooking.isPending}>
              {updateBooking.isPending ? tc('saving') : tc('saveChanges')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

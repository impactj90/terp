'use client'

import { useState, useEffect } from 'react'
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

/**
 * Convert HH:MM string to minutes from midnight.
 */
function timeStringToMinutes(time: string): number {
  const parts = time.split(':').map(Number)
  const hours = parts[0] ?? 0
  const minutes = parts[1] ?? 0
  return hours * 60 + minutes
}

export function BookingEditDialog({
  booking,
  open,
  onOpenChange,
  onSuccess,
}: BookingEditDialogProps) {
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
        setError('Invalid time format. Use HH:MM (e.g., 08:30)')
        return
      }

      const minutes = timeStringToMinutes(editedTime)

      await updateBooking.mutateAsync({
        path: { id: booking.id },
        body: {
          edited_time: minutes,
          notes: notes || undefined,
        },
      } as never)

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking')
    }
  }

  if (!booking) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Booking</SheetTitle>
          <SheetDescription>
            {booking.booking_type?.name ?? 'Booking'} on {booking.booking_date}
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
            <Label>Original Time</Label>
            <Input
              value={minutesToTimeString(booking.original_time)}
              disabled
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Original time from terminal (cannot be changed)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="editedTime">Edited Time</Label>
            <Input
              id="editedTime"
              value={editedTime}
              onChange={(e) => setEditedTime(e.target.value)}
              placeholder="HH:MM"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Time after manual corrections (HH:MM format)
            </p>
          </div>

          {booking.calculated_time !== undefined && booking.calculated_time !== null && (
            <div className="space-y-2">
              <Label>Calculated Time</Label>
              <Input
                value={minutesToTimeString(booking.calculated_time)}
                disabled
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Time after tolerance and rounding rules applied
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateBooking.isPending}>
              {updateBooking.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

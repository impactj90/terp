'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useBookingTypes, useCreateBooking } from '@/hooks/api'
import { formatDate, getCurrentTimeString } from '@/lib/time-utils'

interface BookingCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId?: string
  date: Date
}

export function BookingCreateDialog({
  open,
  onOpenChange,
  employeeId,
  date,
}: BookingCreateDialogProps) {
  const t = useTranslations('timesheet')
  const tc = useTranslations('common')
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [time, setTime] = useState(getCurrentTimeString())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const bookingTypesQuery = useBookingTypes({ active: true, enabled: open })
  const createBooking = useCreateBooking()
  const bookingTypes = bookingTypesQuery.data?.data ?? []

  useEffect(() => {
    if (!open) return
    setTime(getCurrentTimeString())
    setNotes('')
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (bookingTypes.length === 0) {
      setSelectedTypeId('')
      return
    }

    setSelectedTypeId((current) => {
      if (current && bookingTypes.some(bt => bt.id === current)) {
        return current
      }
      return bookingTypes[0]?.id ?? ''
    })
  }, [open, bookingTypes])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employeeId) return

    setError(null)

    if (!selectedTypeId) {
      setError(t('selectBookingType'))
      return
    }

    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/
    if (!timeRegex.test(time)) {
      setError(t('invalidTimeFormat'))
      return
    }

    try {
      await createBooking.mutateAsync({
        body: {
          employee_id: employeeId,
          booking_date: formatDate(date),
          booking_type_id: selectedTypeId,
          time,
          notes: notes || undefined,
        },
      } as never)

      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToCreate'))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('addBooking')}</SheetTitle>
          <SheetDescription>{t('createBookingDescription')}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="ml-2">{error}</span>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="bookingType">{t('bookingType')}</Label>
            <Select
              value={selectedTypeId}
              onValueChange={setSelectedTypeId}
              disabled={bookingTypesQuery.isLoading}
            >
              <SelectTrigger id="bookingType">
                <SelectValue placeholder={t('selectBookingType')} />
              </SelectTrigger>
              <SelectContent>
                {bookingTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookingTime">{t('timeLabel')}</Label>
            <Input
              id="bookingTime"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="HH:MM"
              className="font-mono"
            />
          </div>

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
            <Button
              type="submit"
              disabled={createBooking.isPending || !employeeId}
            >
              {createBooking.isPending ? tc('saving') : tc('create')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

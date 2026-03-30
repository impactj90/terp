import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BookingPair } from './booking-pair'
import { groupBookingsIntoPairs } from './utils'

interface Booking {
  id: string
  booking_date?: string
  booking_type?: { code: string; name: string; direction: 'in' | 'out' } | null
  original_time: number
  edited_time: number
  calculated_time?: number | null
  source: string
  notes?: string | null
  pair_id?: string | null
}

interface BookingListProps {
  bookings?: Booking[]
  isLoading?: boolean
  isEditable?: boolean
  onEdit?: (booking: Booking) => void
  onDelete?: (booking: Booking) => void
  onAdd?: () => void
}

/**
 * Display a list of booking pairs for a day.
 */
export function BookingList({
  bookings = [],
  isLoading,
  isEditable = false,
  onEdit,
  onDelete,
  onAdd,
}: BookingListProps) {
  const t = useTranslations('timesheet')

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  const pairs = groupBookingsIntoPairs(bookings)

  if (pairs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">{t('noBookingsForDay')}</p>
        {isEditable && onAdd && (
          <Button variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            {t('addBooking')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {pairs.map((pair, index) => (
        <BookingPair
          key={pair.inBooking?.id ?? pair.outBooking?.id ?? index}
          inBooking={pair.inBooking}
          outBooking={pair.outBooking}
          durationMinutes={pair.duration}
          isEditable={isEditable}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
      {isEditable && onAdd && (
        <Button variant="outline" className="w-full mt-1" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          {t('addBooking')}
        </Button>
      )}
    </div>
  )
}

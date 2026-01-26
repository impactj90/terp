import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BookingPair } from './booking-pair'

interface Booking {
  id: string
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
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  // Group bookings into pairs
  const pairs = groupBookingsIntoPairs(bookings)

  if (pairs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">No bookings for this day</p>
        {isEditable && onAdd && (
          <Button variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Booking
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
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
        <Button variant="outline" className="w-full" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Booking
        </Button>
      )}
    </div>
  )
}

interface BookingPairData {
  inBooking?: Booking | null
  outBooking?: Booking | null
  duration?: number | null
}

/**
 * Group bookings into IN/OUT pairs based on pair_id or sequential matching.
 */
function groupBookingsIntoPairs(bookings: Booking[]): BookingPairData[] {
  const pairs: BookingPairData[] = []
  const used = new Set<string>()

  // Sort by time
  const sorted = [...bookings].sort((a, b) =>
    (a.calculated_time ?? a.edited_time) - (b.calculated_time ?? b.edited_time)
  )

  // First pass: match by pair_id
  for (const booking of sorted) {
    if (used.has(booking.id)) continue
    if (!booking.pair_id) continue

    const paired = sorted.find(
      b => b.id === booking.pair_id && !used.has(b.id)
    )
    if (paired) {
      const isIn = booking.booking_type?.direction === 'in'
      const inB = isIn ? booking : paired
      const outB = isIn ? paired : booking

      const inTime = inB.calculated_time ?? inB.edited_time
      const outTime = outB.calculated_time ?? outB.edited_time

      pairs.push({
        inBooking: inB,
        outBooking: outB,
        duration: outTime - inTime,
      })
      used.add(booking.id)
      used.add(paired.id)
    }
  }

  // Second pass: sequential matching for unpaired bookings
  const unpaired = sorted.filter(b => !used.has(b.id))
  let i = 0
  while (i < unpaired.length) {
    const current = unpaired[i]
    if (!current) break
    const isIn = current.booking_type?.direction === 'in'

    if (isIn && i + 1 < unpaired.length) {
      const next = unpaired[i + 1]
      if (!next) break
      const isOut = next.booking_type?.direction === 'out'

      if (isOut) {
        const inTime = current.calculated_time ?? current.edited_time
        const outTime = next.calculated_time ?? next.edited_time

        pairs.push({
          inBooking: current,
          outBooking: next,
          duration: outTime - inTime,
        })
        i += 2
        continue
      }
    }

    // Unpaired booking
    pairs.push({
      inBooking: isIn ? current : null,
      outBooking: isIn ? null : current,
      duration: null,
    })
    i++
  }

  return pairs
}

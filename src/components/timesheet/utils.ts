interface PairableBooking {
  id: string
  booking_type?: { code: string; name: string; direction: 'in' | 'out' } | null
  original_time: number
  edited_time: number
  calculated_time?: number | null
  pair_id?: string | null
}

export interface BookingPairData<T extends PairableBooking = PairableBooking> {
  inBooking?: T | null
  outBooking?: T | null
  duration?: number | null
}

/**
 * Group bookings into IN/OUT pairs based on pair_id or sequential matching.
 */
export function groupBookingsIntoPairs<T extends PairableBooking>(bookings: T[]): BookingPairData<T>[] {
  const pairs: BookingPairData<T>[] = []
  const used = new Set<string>()

  const sorted = [...bookings].sort(
    (a, b) => (a.calculated_time ?? a.edited_time) - (b.calculated_time ?? b.edited_time),
  )

  // First pass: match by pair_id
  for (const booking of sorted) {
    if (used.has(booking.id)) continue
    if (!booking.pair_id) continue

    const paired = sorted.find((b) => b.id === booking.pair_id && !used.has(b.id))
    if (paired) {
      const isIn = booking.booking_type?.direction === 'in'
      const inB = isIn ? booking : paired
      const outB = isIn ? paired : booking

      const inTime = inB.calculated_time ?? inB.edited_time
      const outTime = outB.calculated_time ?? outB.edited_time

      pairs.push({ inBooking: inB, outBooking: outB, duration: outTime - inTime })
      used.add(booking.id)
      used.add(paired.id)
    }
  }

  // Second pass: sequential matching for unpaired bookings
  const unpaired = sorted.filter((b) => !used.has(b.id))
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

        pairs.push({ inBooking: current, outBooking: next, duration: outTime - inTime })
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

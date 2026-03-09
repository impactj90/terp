import { useTranslations } from 'next-intl'
import { Clock, ArrowRight, Edit, Trash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookingTimeTriple } from './time-display'

interface Booking {
  id: string
  booking_date?: string
  booking_type?: { code: string; name: string; direction: 'in' | 'out' } | null
  original_time: number
  edited_time: number
  calculated_time?: number | null
  source: string
  notes?: string | null
}

interface BookingPairProps {
  inBooking?: Booking | null
  outBooking?: Booking | null
  durationMinutes?: number | null
  isEditable?: boolean
  onEdit?: (booking: Booking) => void
  onDelete?: (booking: Booking) => void
  className?: string
}

/**
 * Display a pair of IN/OUT bookings with calculated duration.
 */
export function BookingPair({
  inBooking,
  outBooking,
  durationMinutes,
  isEditable = false,
  onEdit,
  onDelete,
  className,
}: BookingPairProps) {
  const t = useTranslations('timesheet')
  const hasInBooking = !!inBooking
  const hasOutBooking = !!outBooking
  const isPaired = hasInBooking && hasOutBooking
  const isMissing = !hasInBooking || !hasOutBooking

  return (
    <div className={cn(
      'flex items-center gap-4 py-3 px-4 rounded-lg border',
      isMissing && 'border-dashed border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-900/10',
      className
    )}>
      {/* Clock icon */}
      <Clock className={cn(
        'h-4 w-4 shrink-0',
        isMissing ? 'text-yellow-600' : 'text-muted-foreground'
      )} />

      {/* IN booking */}
      <div className="flex-1 min-w-0">
        {hasInBooking ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {inBooking.booking_type?.name ?? 'IN'}
            </Badge>
            <BookingTimeTriple
              original={inBooking.original_time}
              edited={inBooking.edited_time}
              calculated={inBooking.calculated_time}
            />
            {inBooking.source !== 'terminal' && (
              <Badge variant="secondary" className="text-xs">
                {inBooking.source}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-yellow-600 italic">{t('missingInBooking')}</span>
        )}
      </div>

      {/* Arrow */}
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

      {/* OUT booking */}
      <div className="flex-1 min-w-0">
        {hasOutBooking ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {outBooking.booking_type?.name ?? 'OUT'}
            </Badge>
            <BookingTimeTriple
              original={outBooking.original_time}
              edited={outBooking.edited_time}
              calculated={outBooking.calculated_time}
            />
            {outBooking.source !== 'terminal' && (
              <Badge variant="secondary" className="text-xs">
                {outBooking.source}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-sm text-yellow-600 italic">{t('missingOutBooking')}</span>
        )}
      </div>

      {/* Duration */}
      {isPaired && durationMinutes !== undefined && durationMinutes !== null && (
        <div className="text-sm font-medium tabular-nums min-w-[60px] text-right">
          {Math.floor(durationMinutes / 60)}:{(durationMinutes % 60).toString().padStart(2, '0')}
        </div>
      )}

      {/* Actions */}
      {isEditable && (
        <div className="flex items-center gap-1">
          {hasInBooking && (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onEdit?.(inBooking)}
                aria-label={t('editInBooking')}
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onDelete?.(inBooking)}
                aria-label={t('deleteInBooking')}
              >
                <Trash className="h-3 w-3" />
              </Button>
            </>
          )}
          {hasOutBooking && (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onEdit?.(outBooking)}
                aria-label={t('editOutBooking')}
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onDelete?.(outBooking)}
                aria-label={t('deleteOutBooking')}
              >
                <Trash className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

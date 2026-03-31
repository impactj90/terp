import { useTranslations } from 'next-intl'
import { Clock, ArrowRight, Pencil, Trash2, MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

  const actionsMenu = isEditable && (hasInBooking || hasOutBooking) && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity shrink-0"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {hasInBooking && (
          <>
            <DropdownMenuItem onClick={() => onEdit?.(inBooking)}>
              <Pencil className="h-3.5 w-3.5" />
              {t('editInBooking')}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete?.(inBooking)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('deleteInBooking')}
            </DropdownMenuItem>
          </>
        )}
        {hasInBooking && hasOutBooking && <DropdownMenuSeparator />}
        {hasOutBooking && (
          <>
            <DropdownMenuItem onClick={() => onEdit?.(outBooking)}>
              <Pencil className="h-3.5 w-3.5" />
              {t('editOutBooking')}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete?.(outBooking)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('deleteOutBooking')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div
      className={cn(
        'group rounded-lg border transition-colors',
        isMissing
          ? 'border-dashed border-amber-500/40 bg-amber-500/5'
          : 'border-transparent bg-muted/30 hover:bg-muted/50',
        className,
      )}
    >
      {/* Mobile: stacked layout */}
      <div className="sm:hidden p-3 space-y-2">
        {/* Header row: icon + duration + actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                isMissing ? 'text-amber-500' : 'text-muted-foreground/50',
              )}
            />
            {isPaired && durationMinutes != null && (
              <span className="text-sm font-medium tabular-nums font-mono">
                {Math.floor(durationMinutes / 60)}:
                {(durationMinutes % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>
          {actionsMenu}
        </div>
        {/* IN booking row */}
        <div className="flex items-center gap-2 min-w-0">
          {hasInBooking ? (
            <>
              <Badge
                variant="outline"
                className="text-[11px] px-1.5 py-0 h-5 font-normal shrink-0"
              >
                {inBooking.booking_type?.name ?? 'IN'}
              </Badge>
              <BookingTimeTriple
                original={inBooking.original_time}
                edited={inBooking.edited_time}
                calculated={inBooking.calculated_time}
              />
            </>
          ) : (
            <span className="text-sm text-amber-500 italic">
              {t('missingInBooking')}
            </span>
          )}
        </div>
        {/* Arrow + OUT booking row */}
        <div className="flex items-center gap-2 min-w-0">
          <ArrowRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
          {hasOutBooking ? (
            <>
              <Badge
                variant="outline"
                className="text-[11px] px-1.5 py-0 h-5 font-normal shrink-0"
              >
                {outBooking.booking_type?.name ?? 'OUT'}
              </Badge>
              <BookingTimeTriple
                original={outBooking.original_time}
                edited={outBooking.edited_time}
                calculated={outBooking.calculated_time}
              />
            </>
          ) : (
            <span className="text-sm text-amber-500 italic">
              {t('missingOutBooking')}
            </span>
          )}
        </div>
      </div>

      {/* Desktop: horizontal layout */}
      <div className="hidden sm:flex items-center gap-3 py-2.5 px-3">
        <Clock
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            isMissing ? 'text-amber-500' : 'text-muted-foreground/50',
          )}
        />

        {/* IN booking */}
        <div className="flex-1 min-w-0">
          {hasInBooking ? (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-[11px] px-1.5 py-0 h-5 font-normal shrink-0"
              >
                {inBooking.booking_type?.name ?? 'IN'}
              </Badge>
              <BookingTimeTriple
                original={inBooking.original_time}
                edited={inBooking.edited_time}
                calculated={inBooking.calculated_time}
              />
            </div>
          ) : (
            <span className="text-sm text-amber-500 italic">
              {t('missingInBooking')}
            </span>
          )}
        </div>

        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />

        {/* OUT booking */}
        <div className="flex-1 min-w-0">
          {hasOutBooking ? (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-[11px] px-1.5 py-0 h-5 font-normal shrink-0"
              >
                {outBooking.booking_type?.name ?? 'OUT'}
              </Badge>
              <BookingTimeTriple
                original={outBooking.original_time}
                edited={outBooking.edited_time}
                calculated={outBooking.calculated_time}
              />
            </div>
          ) : (
            <span className="text-sm text-amber-500 italic">
              {t('missingOutBooking')}
            </span>
          )}
        </div>

        {/* Duration */}
        {isPaired && durationMinutes != null && (
          <div className="text-sm font-medium tabular-nums min-w-[48px] text-right font-mono">
            {Math.floor(durationMinutes / 60)}:
            {(durationMinutes % 60).toString().padStart(2, '0')}
          </div>
        )}

        {actionsMenu}
      </div>
    </div>
  )
}

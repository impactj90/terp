'use client'

import { useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Clock, LogIn, LogOut } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarBadge } from '@/components/ui/avatar'
import { MemberRoleBadge } from '@/components/teams/member-role-badge'
import { formatMinutes, formatTime } from '@/lib/time-utils'
import { cn } from '@/lib/utils'
interface TeamMember {
  teamId: string
  employeeId: string
  role: 'member' | 'lead' | 'deputy'
  joinedAt: Date | string
  employee?: {
    id: string
    firstName: string
    lastName: string
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DayViewData = Record<string, any> | null | undefined

interface TeamMemberStatusRowProps {
  member: TeamMember
  dayView: DayViewData
  isLoading?: boolean
}

type AttendanceStatus =
  | 'holiday'
  | 'weekend'
  | 'on-leave'
  | 'clocked-in'
  | 'clocked-out'
  | 'not-yet-in'

interface StatusConfig {
  labelKey: string
  badgeVariant: string
  dotClass: string
}

const statusConfigMap: Record<AttendanceStatus, StatusConfig> = {
  holiday: {
    labelKey: 'statusHoliday',
    dotClass: 'bg-gray-400',
    badgeVariant: '',
  },
  weekend: {
    labelKey: 'statusWeekend',
    dotClass: 'bg-gray-400',
    badgeVariant: '',
  },
  'on-leave': {
    labelKey: 'statusOnLeave',
    dotClass: 'bg-amber-400',
    badgeVariant: 'amber',
  },
  'clocked-in': {
    labelKey: 'statusClockedIn',
    dotClass: 'bg-emerald-500',
    badgeVariant: 'green',
  },
  'clocked-out': {
    labelKey: 'statusClockedOut',
    dotClass: 'bg-gray-400',
    badgeVariant: 'gray',
  },
  'not-yet-in': {
    labelKey: 'statusNotYetIn',
    dotClass: 'bg-gray-300 dark:bg-gray-600',
    badgeVariant: '',
  },
}

function getWorkBookings(dayView: DayViewData) {
  const bookings = dayView?.bookings ?? []
  return bookings.filter(
    (b: { bookingType?: { direction?: string } }) =>
      b.bookingType?.direction === 'in' || b.bookingType?.direction === 'out'
  )
}

function getAttendanceStatus(dayView: DayViewData): AttendanceStatus {
  if (!dayView) return 'not-yet-in'

  const isHoliday = dayView.isHoliday ?? false

  if (isHoliday) return 'holiday'

  const workBookings = getWorkBookings(dayView)
  const sortedBookings = [...workBookings].sort(
    (a: { editedTime: number }, b: { editedTime: number }) => a.editedTime - b.editedTime
  )
  const lastBooking = sortedBookings[sortedBookings.length - 1]
  const isClockedIn = lastBooking?.bookingType?.direction === 'in'

  if (isClockedIn) return 'clocked-in'
  if (workBookings.length > 0) return 'clocked-out'
  return 'not-yet-in'
}

function getClockInTime(dayView: DayViewData): string | null {
  if (!dayView) return null
  const workBookings = getWorkBookings(dayView)
  const sortedBookings = [...workBookings].sort(
    (a: { editedTime: number }, b: { editedTime: number }) => a.editedTime - b.editedTime
  )
  const firstIn = sortedBookings.find(
    (b: { bookingType?: { direction?: string } }) => b.bookingType?.direction === 'in'
  )
  if (!firstIn) return null
  return formatTime(firstIn.editedTime)
}

function getClockOutTime(dayView: DayViewData): string | null {
  if (!dayView) return null
  const workBookings = getWorkBookings(dayView)
  const sortedBookings = [...workBookings].sort(
    (a: { editedTime: number }, b: { editedTime: number }) => a.editedTime - b.editedTime
  )
  const lastOut = [...sortedBookings].reverse().find(
    (b: { bookingType?: { direction?: string } }) => b.bookingType?.direction === 'out'
  )
  if (!lastOut) return null
  return formatTime(lastOut.editedTime)
}

/**
 * Single team member row showing attendance status for today.
 * Displays avatar with status dot, name, role, status badge, clock-in time, and net hours.
 */
export function TeamMemberStatusRow({ member, dayView, isLoading }: TeamMemberStatusRowProps) {
  const t = useTranslations('teamOverview')
  const [expanded, setExpanded] = useState(false)

  const toggleExpanded = () => setExpanded((prev) => !prev)
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleExpanded()
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    )
  }

  const firstName = member.employee?.firstName ?? ''
  const lastName = member.employee?.lastName ?? ''
  const initials = `${firstName[0] ?? '?'}${lastName[0] ?? '?'}`
  const fullName = member.employee
    ? `${firstName} ${lastName}`
    : t('unknownEmployee')

  const status = getAttendanceStatus(dayView)
  const config = statusConfigMap[status]
  const clockInTime = getClockInTime(dayView)
  const clockOutTime = getClockOutTime(dayView)
  const workBookings = getWorkBookings(dayView)
  const netMinutes = dayView?.dailyValue?.netTime ?? 0
  const targetMinutes = dayView?.dailyValue?.targetTime ?? 0
  const overtimeMinutes = dayView?.dailyValue?.overtime ?? 0
  const undertimeMinutes = dayView?.dailyValue?.undertime ?? 0

  return (
    <div
      className={cn(
        'rounded-lg transition-colors',
        expanded && 'bg-muted/40'
      )}
    >
      <div
        className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
      >
        {/* Avatar with status indicator */}
        <Avatar>
          <AvatarFallback className="text-xs font-semibold">
            {initials}
          </AvatarFallback>
          <AvatarBadge
            className={cn(
              'ring-card',
              config.dotClass,
              status === 'clocked-in' && 'animate-pulse'
            )}
          />
        </Avatar>

        {/* Name and role */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-medium truncate">{fullName}</p>
            <MemberRoleBadge role={member.role} />
          </div>
          {/* Time info inline */}
          {clockInTime && (
            <div className="flex items-center gap-3 mt-0.5">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <LogIn className="h-3 w-3 shrink-0" />
                {clockInTime}
              </span>
              {netMinutes > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/80">
                  <Clock className="h-3 w-3 shrink-0" />
                  {formatMinutes(netMinutes)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Status badge — hidden on mobile (status already visible via avatar dot), shown on sm+ */}
        {config.badgeVariant ? (
          <Badge variant={config.badgeVariant as 'amber' | 'green' | 'gray'} className="text-[11px] font-medium shrink-0 hidden sm:inline-flex">
            {t(config.labelKey as Parameters<typeof t>[0])}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[11px] shrink-0 hidden sm:inline-flex">
            {t(config.labelKey as Parameters<typeof t>[0])}
          </Badge>
        )}

        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
        <span className="sr-only">
          {expanded ? t('collapseDetails') : t('expandDetails')}
        </span>
      </div>

      {/* Expanded detail panel */}
      <div
        className={cn(
          'grid transition-all duration-200 ease-out',
          expanded
            ? 'grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1">
            {workBookings.length === 0 && !dayView?.dailyValue ? (
              <p className="text-xs text-muted-foreground py-2">
                {t('noDetailsAvailable')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-px rounded-lg border bg-border overflow-hidden sm:grid-cols-3">
                <DetailCell
                  icon={<LogIn className="h-3.5 w-3.5 text-emerald-500" />}
                  label={t('firstIn')}
                  value={clockInTime ?? '\u2013'}
                />
                <DetailCell
                  icon={<LogOut className="h-3.5 w-3.5 text-gray-400" />}
                  label={t('lastOut')}
                  value={clockOutTime ?? '\u2013'}
                />
                <DetailCell
                  icon={<Clock className="h-3.5 w-3.5 text-blue-500" />}
                  label={t('netTime')}
                  value={formatMinutes(netMinutes)}
                />
                <DetailCell
                  icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                  label={t('targetTime')}
                  value={formatMinutes(targetMinutes)}
                />
                <DetailCell
                  icon={
                    <span className="inline-block h-3.5 w-3.5 text-center text-xs font-bold text-emerald-500">
                      +
                    </span>
                  }
                  label={t('overtime')}
                  value={formatMinutes(overtimeMinutes)}
                  highlight={overtimeMinutes > 0 ? 'positive' : undefined}
                />
                <DetailCell
                  icon={
                    <span className="inline-block h-3.5 w-3.5 text-center text-xs font-bold text-rose-500">
                      &minus;
                    </span>
                  }
                  label={t('undertime')}
                  value={formatMinutes(undertimeMinutes)}
                  highlight={undertimeMinutes > 0 ? 'negative' : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailCell({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: 'positive' | 'negative'
}) {
  return (
    <div className="flex items-center justify-between gap-2 bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span
        className={cn(
          'text-sm font-medium tabular-nums',
          highlight === 'positive' && 'text-emerald-600 dark:text-emerald-400',
          highlight === 'negative' && 'text-rose-600 dark:text-rose-400',
          !highlight && 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  )
}

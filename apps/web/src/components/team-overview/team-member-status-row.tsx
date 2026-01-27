'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MemberRoleBadge } from '@/components/teams/member-role-badge'
import { formatMinutes, formatTime } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type TeamMember = components['schemas']['TeamMember']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DayViewData = Record<string, any> | null | undefined

interface TeamMemberStatusRowProps {
  member: TeamMember
  dayView: DayViewData
  isLoading?: boolean
}

type AttendanceStatus = 'holiday' | 'weekend' | 'on-leave' | 'clocked-in' | 'completed' | 'not-yet-in'

interface StatusConfig {
  labelKey: string
  dotClass: string
  badgeClass: string
}

const statusConfigMap: Record<AttendanceStatus, StatusConfig> = {
  holiday: {
    labelKey: 'statusHoliday',
    dotClass: 'bg-gray-400',
    badgeClass: '',
  },
  weekend: {
    labelKey: 'statusWeekend',
    dotClass: 'bg-gray-400',
    badgeClass: '',
  },
  'on-leave': {
    labelKey: 'statusOnLeave',
    dotClass: 'bg-yellow-400',
    badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  'clocked-in': {
    labelKey: 'statusClockedIn',
    dotClass: 'bg-green-400',
    badgeClass: 'bg-green-500 text-white hover:bg-green-500',
  },
  completed: {
    labelKey: 'statusCompleted',
    dotClass: 'bg-blue-400',
    badgeClass: '',
  },
  'not-yet-in': {
    labelKey: 'statusNotYetIn',
    dotClass: 'bg-gray-300',
    badgeClass: '',
  },
}

function getAttendanceStatus(dayView: DayViewData): AttendanceStatus {
  if (!dayView) return 'not-yet-in'

  const isHoliday = dayView.is_holiday ?? false
  const dailyValue = dayView.daily_value
  const isWeekend = dailyValue?.is_weekend ?? false
  const isAbsence = dailyValue?.is_absence ?? false

  if (isHoliday) return 'holiday'
  if (isWeekend) return 'weekend'
  if (isAbsence) return 'on-leave'

  const bookings = dayView.bookings ?? []
  const workBookings = bookings.filter(
    (b: { booking_type?: { direction?: string } }) =>
      b.booking_type?.direction === 'in' || b.booking_type?.direction === 'out'
  )
  const sortedBookings = [...workBookings].sort(
    (a: { edited_time: number }, b: { edited_time: number }) => a.edited_time - b.edited_time
  )
  const lastBooking = sortedBookings[sortedBookings.length - 1]
  const isClockedIn = lastBooking?.booking_type?.direction === 'in'

  if (isClockedIn) return 'clocked-in'
  if (bookings.length > 0) return 'completed'
  return 'not-yet-in'
}

function getClockInTime(dayView: DayViewData): string | null {
  if (!dayView) return null
  const bookings = dayView.bookings ?? []
  const workBookings = bookings.filter(
    (b: { booking_type?: { direction?: string } }) =>
      b.booking_type?.direction === 'in' || b.booking_type?.direction === 'out'
  )
  const sortedBookings = [...workBookings].sort(
    (a: { edited_time: number }, b: { edited_time: number }) => a.edited_time - b.edited_time
  )
  const firstIn = sortedBookings.find(
    (b: { booking_type?: { direction?: string } }) => b.booking_type?.direction === 'in'
  )
  if (!firstIn) return null
  return firstIn.time_string ?? formatTime(firstIn.edited_time)
}

/**
 * Single team member row showing attendance status for today.
 * Displays avatar, name, role, status badge, clock-in time, and net hours.
 */
export function TeamMemberStatusRow({ member, dayView, isLoading }: TeamMemberStatusRowProps) {
  const t = useTranslations('teamOverview')

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-md">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
    )
  }

  const firstName = member.employee?.first_name ?? ''
  const lastName = member.employee?.last_name ?? ''
  const initials = `${firstName[0] ?? '?'}${lastName[0] ?? '?'}`
  const fullName = member.employee
    ? `${firstName} ${lastName}`
    : t('unknownEmployee')
  const department = member.employee?.department?.name ?? ''

  const status = getAttendanceStatus(dayView)
  const config = statusConfigMap[status]
  const clockInTime = getClockInTime(dayView)
  const netMinutes = dayView?.daily_value?.net_minutes ?? dayView?.daily_value?.net_time ?? 0

  return (
    <div className="flex items-center gap-3 p-3 rounded-md hover:bg-muted/50 transition-colors">
      {/* Avatar with status dot */}
      <div className="relative">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
          {initials}
        </div>
        <div
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${config.dotClass}`}
        />
      </div>

      {/* Name and department */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fullName}</p>
        <div className="flex items-center gap-2">
          {department && (
            <p className="text-xs text-muted-foreground truncate">{department}</p>
          )}
        </div>
      </div>

      {/* Role badge */}
      <MemberRoleBadge role={member.role} />

      {/* Clock-in time */}
      {clockInTime && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {clockInTime}
        </span>
      )}

      {/* Net worked hours */}
      {netMinutes > 0 && (
        <span className="text-xs font-medium whitespace-nowrap">
          {formatMinutes(netMinutes)}
        </span>
      )}

      {/* Status badge */}
      {config.badgeClass ? (
        <Badge className={config.badgeClass}>
          {t(config.labelKey as Parameters<typeof t>[0])}
        </Badge>
      ) : (
        <Badge variant="outline">{t(config.labelKey as Parameters<typeof t>[0])}</Badge>
      )}
    </div>
  )
}

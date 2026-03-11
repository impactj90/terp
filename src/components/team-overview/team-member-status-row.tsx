'use client'

import { useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MemberRoleBadge } from '@/components/teams/member-role-badge'
import { formatMinutes, formatTime } from '@/lib/time-utils'
import { cn } from '@/lib/utils'
interface TeamMember {
  teamId: string
  employeeId: string
  role: string
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
  'clocked-out': {
    labelKey: 'statusClockedOut',
    dotClass: 'bg-gray-400',
    badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200',
  },
  'not-yet-in': {
    labelKey: 'statusNotYetIn',
    dotClass: 'bg-gray-300',
    badgeClass: '',
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
 * Displays avatar, name, role, status badge, clock-in time, and net hours.
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

  const firstName = member.employee?.firstName ?? ''
  const lastName = member.employee?.lastName ?? ''
  const initials = `${firstName[0] ?? '?'}${lastName[0] ?? '?'}`
  const fullName = member.employee
    ? `${firstName} ${lastName}`
    : t('unknownEmployee')
  const department = ''

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
    <div className="border-b last:border-b-0">
      <div
        className="flex items-center gap-3 p-3 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
      >
        {/* Avatar */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
          {initials}
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

        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
        />
        <span className="sr-only">
          {expanded ? t('collapseDetails') : t('expandDetails')}
        </span>
      </div>

      {expanded && (
        <div className="px-3 pb-3 text-xs text-muted-foreground">
          {workBookings.length === 0 && !dayView?.dailyValue ? (
            <p>{t('noDetailsAvailable')}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between">
                <span>{t('firstIn')}</span>
                <span className="font-medium text-foreground">
                  {clockInTime ?? '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('lastOut')}</span>
                <span className="font-medium text-foreground">
                  {clockOutTime ?? '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('netTime')}</span>
                <span className="font-medium text-foreground">
                  {formatMinutes(netMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('targetTime')}</span>
                <span className="font-medium text-foreground">
                  {formatMinutes(targetMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('overtime')}</span>
                <span className="font-medium text-foreground">
                  {formatMinutes(overtimeMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('undertime')}</span>
                <span className="font-medium text-foreground">
                  {formatMinutes(undertimeMinutes)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

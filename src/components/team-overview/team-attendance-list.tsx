'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TeamMemberStatusRow } from './team-member-status-row'
import { formatDisplayDate, parseISODate } from '@/lib/time-utils'
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

interface TeamAttendanceListProps {
  members: TeamMember[]
  dayViewsData: DayViewData[]
  dayViewsLoading: boolean
  date?: string
}

type AttendanceGroup = 'in' | 'out' | 'on-leave' | 'not-yet-in'

interface GroupedMember {
  member: TeamMember
  dayView: DayViewData
  group: AttendanceGroup
}

const groupConfig: Record<
  AttendanceGroup,
  { labelKey: string; dotClass: string; textClass: string }
> = {
  in: {
    labelKey: 'filterIn',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700 dark:text-emerald-400',
  },
  out: {
    labelKey: 'filterOut',
    dotClass: 'bg-gray-400',
    textClass: 'text-gray-600 dark:text-gray-400',
  },
  'on-leave': {
    labelKey: 'filterOnLeave',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  'not-yet-in': {
    labelKey: 'filterNotYetIn',
    dotClass: 'bg-gray-300 dark:bg-gray-600',
    textClass: 'text-gray-500 dark:text-gray-500',
  },
}

const groupOrder: AttendanceGroup[] = ['in', 'out', 'on-leave', 'not-yet-in']

function getWorkBookings(dayView: DayViewData) {
  const bookings = dayView?.bookings ?? []
  return bookings.filter(
    (b: { bookingType?: { direction?: string } }) =>
      b.bookingType?.direction === 'in' || b.bookingType?.direction === 'out'
  )
}

function getLastDirection(dayView: DayViewData) {
  const workBookings = getWorkBookings(dayView)
  if (workBookings.length === 0) return null
  const sorted = [...workBookings].sort(
    (a: { editedTime: number }, b: { editedTime: number }) => a.editedTime - b.editedTime
  )
  return sorted[sorted.length - 1]?.bookingType?.direction ?? null
}

function classifyMember(dayView: DayViewData): AttendanceGroup {
  if (!dayView) return 'not-yet-in'
  const isHoliday = dayView.isHoliday ?? false
  if (isHoliday) return 'not-yet-in'
  const lastDirection = getLastDirection(dayView)
  if (lastDirection === 'in') return 'in'
  if (lastDirection === 'out') return 'out'
  return 'not-yet-in'
}

/**
 * Team attendance list showing all team members grouped by status.
 * Groups: In, Out, On Leave, then Not Yet In.
 * Receives pre-fetched day views data from the parent page to avoid duplicate requests.
 */
export function TeamAttendanceList({
  members,
  dayViewsData,
  dayViewsLoading,
  date,
}: TeamAttendanceListProps) {
  const t = useTranslations('teamOverview')
  const locale = useLocale()
  const attendanceDateLabel = date
    ? formatDisplayDate(parseISODate(date), 'short', locale)
    : null
  const title = attendanceDateLabel
    ? t('attendanceForDate', { date: attendanceDateLabel })
    : t('teamAttendance')

  // Create employeeId -> dayView map for O(1) lookup
  const dayViewMap = useMemo(() => {
    const map = new Map<string, DayViewData>()
    for (const dv of dayViewsData) {
      if (dv?.employeeId) {
        map.set(dv.employeeId as string, dv)
      }
    }
    return map
  }, [dayViewsData])

  // Classify and group members
  const grouped = useMemo(() => {
    const result: Record<AttendanceGroup, GroupedMember[]> = {
      in: [],
      out: [],
      'on-leave': [],
      'not-yet-in': [],
    }

    for (const member of members) {
      const dayView = dayViewMap.get(member.employeeId)
      const group = classifyMember(dayView)
      result[group].push({ member, dayView, group })
    }

    return result
  }, [members, dayViewMap])

  if (dayViewsLoading && members.length === 0) {
    return (
      <Card className="overflow-hidden rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/20 p-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalGrouped = groupOrder.reduce(
    (sum, g) => sum + grouped[g].length,
    0
  )

  return (
    <Card className="overflow-hidden rounded-xl">
      <CardHeader className="pb-3 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {/* Mini status summary */}
          {totalGrouped > 0 && (
            <div className="flex items-center gap-3">
              {groupOrder.map((group) => {
                const count = grouped[group].length
                if (count === 0) return null
                const cfg = groupConfig[group]
                return (
                  <div key={group} className="flex items-center gap-1.5">
                    <span
                      className={cn('h-2 w-2 rounded-full', cfg.dotClass)}
                    />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <div className="space-y-1">
          {groupOrder.map((group) => {
            const groupMembers = grouped[group]
            if (groupMembers.length === 0) return null

            const cfg = groupConfig[group]

            return (
              <div key={group}>
                {/* Group header */}
                <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                  <span
                    className={cn('h-2 w-2 rounded-full', cfg.dotClass)}
                  />
                  <h4
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wider',
                      cfg.textClass
                    )}
                  >
                    {t(groupConfig[group].labelKey as Parameters<typeof t>[0])}{' '}
                    ({groupMembers.length})
                  </h4>
                </div>

                {/* Member rows */}
                <div className="space-y-0.5">
                  {groupMembers.map(({ member, dayView }) => (
                    <TeamMemberStatusRow
                      key={member.employeeId}
                      member={member}
                      dayView={dayView}
                      isLoading={dayViewsLoading}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {members.length === 0 && !dayViewsLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('noMembersToDisplay')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

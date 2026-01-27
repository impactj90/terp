'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TeamMemberStatusRow } from './team-member-status-row'
import type { components } from '@/lib/api/types'

type TeamMember = components['schemas']['TeamMember']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DayViewData = Record<string, any> | null | undefined

interface TeamAttendanceListProps {
  members: TeamMember[]
  dayViewsData: DayViewData[]
  dayViewsLoading: boolean
  date?: string
}

type AttendanceGroup = 'present' | 'on-leave' | 'not-yet-in'

interface GroupedMember {
  member: TeamMember
  dayView: DayViewData
  group: AttendanceGroup
}

function classifyMember(member: TeamMember, dayView: DayViewData): AttendanceGroup {
  if (!dayView) return 'not-yet-in'

  const isHoliday = dayView.is_holiday ?? false
  const dailyValue = dayView.daily_value
  const isWeekend = dailyValue?.is_weekend ?? false
  const isAbsence = dailyValue?.is_absence ?? false

  if (isAbsence) return 'on-leave'
  if (isHoliday || isWeekend) return 'not-yet-in'

  const bookings = dayView.bookings ?? []
  const workBookings = bookings.filter(
    (b: { booking_type?: { direction?: string } }) =>
      b.booking_type?.direction === 'in' || b.booking_type?.direction === 'out'
  )

  if (workBookings.length > 0) return 'present'
  return 'not-yet-in'
}

const groupLabelKeys: Record<AttendanceGroup, string> = {
  present: 'filterPresent',
  'on-leave': 'filterOnLeave',
  'not-yet-in': 'filterNotYetIn',
}

const groupOrder: AttendanceGroup[] = ['present', 'on-leave', 'not-yet-in']

/**
 * Team attendance list showing all team members grouped by status.
 * Groups: Present first, then On Leave, then Not Yet In.
 * Receives pre-fetched day views data from the parent page to avoid duplicate requests.
 */
export function TeamAttendanceList({
  members,
  dayViewsData,
  dayViewsLoading,
}: TeamAttendanceListProps) {
  const t = useTranslations('teamOverview')
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
      present: [],
      'on-leave': [],
      'not-yet-in': [],
    }

    for (const member of members) {
      const dayView = dayViewMap.get(member.employee_id)
      const group = classifyMember(member, dayView)
      result[group].push({ member, dayView, group })
    }

    return result
  }, [members, dayViewMap])

  if (dayViewsLoading && members.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('teamAttendance')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('teamAttendance')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {groupOrder.map((group) => {
            const groupMembers = grouped[group]
            if (groupMembers.length === 0) return null

            return (
              <div key={group}>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {t(groupLabelKeys[group] as Parameters<typeof t>[0])} ({groupMembers.length})
                </h4>
                <div className="divide-y">
                  {groupMembers.map(({ member, dayView }) => (
                    <TeamMemberStatusRow
                      key={member.employee_id}
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
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('noMembersToDisplay')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

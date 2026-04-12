'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useMyTeams, useMyTeam, useTeamDailyValues } from '@/hooks'
import { useTeamDayViews } from '@/hooks/use-team-day-views'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker'
import { formatDate, getWeekRange } from '@/lib/time-utils'
import {
  TeamSelector,
  TeamAttendanceList,
  TeamStatsCards,
  TeamAttendancePattern,
  TeamUpcomingAbsences,
  TeamQuickActions,
  TeamExportButtons,
} from '@/components/team-overview'
import Link from 'next/link'
import { Users } from 'lucide-react'

export default function TeamOverviewPage() {
  const t = useTranslations('teamOverview')
  const { isLoading: authLoading } = useAuth()
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(undefined)
  const defaultRange = useMemo(() => {
    const { start, end } = getWeekRange(new Date())
    return { from: start, to: end }
  }, [])
  const [range, setRange] = useState<DateRange>(defaultRange)
  const rangeFrom = range?.from ?? defaultRange.from
  const rangeTo = range?.to ?? rangeFrom
  const rangeFromDate = formatDate(rangeFrom)
  const rangeToDate = formatDate(rangeTo)
  const attendanceDate = formatDate(new Date())

  // Fetch active teams for selector (scoped to user's teams)
  const { data: teamsData, isLoading: teamsLoading } = useMyTeams({
    isActive: true,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teams = (teamsData?.items ?? []) as any[]

  // Auto-select first team if only one available
  useEffect(() => {
    if (teams.length === 1 && !selectedTeamId && teams[0]) {
      setSelectedTeamId(teams[0].id)
    }
  }, [teams, selectedTeamId])

  // Fetch selected team with members (with membership check)
  const { data: team, isLoading: teamLoading } = useMyTeam(
    selectedTeamId ?? '',
    !!selectedTeamId
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = (team?.members ?? []) as any[]

  // Fetch day views for all members (used by stats + attendance)
  const employeeIds = members
    .map((m) => m.employeeId)
    .filter((id): id is string => !!id)
  const {
    data: dayViewsData,
    isLoading: dayViewsLoading,
  } = useTeamDayViews({
    employeeIds,
    date: attendanceDate,
    enabled: members.length > 0,
  })
  const {
    data: rangeDailyValues,
    isLoading: rangeDailyValuesLoading,
  } = useTeamDailyValues({
    employeeIds,
    from: rangeFromDate,
    to: rangeToDate,
    enabled: members.length > 0,
  })

  if (authLoading) {
    return <TeamOverviewSkeleton />
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page header */}
      <div className="space-y-3 sm:space-y-0 sm:flex sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={range} onChange={(next) => next && setRange(next)} className="flex-1 sm:flex-initial sm:w-auto" />
          <TeamQuickActions teamId={selectedTeamId} />
          {selectedTeamId && (
            <div className="hidden sm:block">
              <TeamExportButtons
                members={members}
                rangeDailyValues={rangeDailyValues}
                rangeFrom={rangeFromDate}
                rangeTo={rangeToDate}
                isLoading={rangeDailyValuesLoading || teamLoading}
              />
            </div>
          )}
        </div>
      </div>

      {/* Team selector */}
      <TeamSelector
        teams={teams}
        selectedTeamId={selectedTeamId}
        onSelectTeam={setSelectedTeamId}
        isLoading={teamsLoading}
      />

      {/* No teams available */}
      {!teamsLoading && teams.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>{t('noTeamsAvailable')}</p>
              <p className="text-sm mt-1">
                {t('contactAdminForTeam')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content when team is selected */}
      {selectedTeamId && (
        <>
          {/* Empty team (no members) */}
          {!teamLoading && members.length === 0 && (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-3 opacity-50" />
                  <p>{t('noMembersYet')}</p>
                  <p className="text-sm mt-1">
                    {t('addMembersVia')}{' '}
                    <Link href="/admin/teams" className="underline hover:text-foreground">
                      {t('teamManagementLink')}
                    </Link>
                    .
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats cards + content */}
          {(teamLoading || members.length > 0) && (
            <>
              {/* Stats cards */}
              <TeamStatsCards
                members={members}
                dayViewsData={dayViewsData}
                dayViewsLoading={dayViewsLoading || teamLoading}
                rangeDailyValues={rangeDailyValues}
                rangeLoading={rangeDailyValuesLoading || teamLoading}
                rangeFrom={rangeFromDate}
                rangeTo={rangeToDate}
              />

              {/* Two-column layout — stacks on mobile */}
              <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_380px]">
                {/* Left: Attendance list + pattern */}
                <div className="space-y-6">
                  <TeamAttendanceList
                    members={members}
                    dayViewsData={dayViewsData}
                    dayViewsLoading={dayViewsLoading || teamLoading}
                    date={attendanceDate}
                  />
                  <TeamAttendancePattern
                    rangeDailyValues={rangeDailyValues}
                    rangeLoading={rangeDailyValuesLoading || teamLoading}
                    rangeFrom={rangeFromDate}
                    rangeTo={rangeToDate}
                    membersCount={members.length}
                  />
                </div>

                {/* Right: Upcoming absences */}
                <div className="space-y-6">
                  <TeamUpcomingAbsences members={members} from={rangeFromDate} to={rangeToDate} />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* No team selected placeholder */}
      {!selectedTeamId && !teamsLoading && teams.length > 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <p>{t('selectTeamPrompt')}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TeamOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-56 sm:w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 sm:w-[240px] sm:flex-initial" />
          <Skeleton className="h-9 w-9 shrink-0" />
        </div>
      </div>
      <Skeleton className="h-10 w-full sm:w-[280px]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[60px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  )
}

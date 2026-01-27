'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/auth-provider'
import { useTeams, useTeam } from '@/hooks/api'
import { useTeamDayViews } from '@/hooks/api/use-team-day-views'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getToday } from '@/lib/time-utils'
import {
  TeamSelector,
  TeamAttendanceList,
  TeamStatsCards,
  TeamUpcomingAbsences,
  TeamQuickActions,
} from '@/components/team-overview'
import Link from 'next/link'
import { Users } from 'lucide-react'

export default function TeamOverviewPage() {
  const t = useTranslations('teamOverview')
  const { isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(undefined)
  const today = getToday()

  // Fetch active teams for selector
  const { data: teamsData, isLoading: teamsLoading } = useTeams({
    isActive: true,
    limit: 100,
  })
  const teams = teamsData?.items ?? []

  // Auto-select first team if only one available
  useEffect(() => {
    if (teams.length === 1 && !selectedTeamId && teams[0]) {
      setSelectedTeamId(teams[0].id)
    }
  }, [teams, selectedTeamId])

  // Fetch selected team with members
  const { data: team, isLoading: teamLoading } = useTeam(
    selectedTeamId ?? '',
    !!selectedTeamId
  )
  const members = team?.members ?? []

  // Fetch day views for all members (used by stats + attendance)
  const employeeIds = members
    .map((m) => m.employee_id)
    .filter((id): id is string => !!id)
  const {
    data: dayViewsData,
    isLoading: dayViewsLoading,
    refetchAll,
  } = useTeamDayViews({
    employeeIds,
    date: today,
    enabled: members.length > 0,
  })

  const handleRefresh = () => {
    refetchAll()
    if (selectedTeamId) {
      queryClient.invalidateQueries({ queryKey: ['/teams/{id}'] })
    }
  }

  if (authLoading) {
    return <TeamOverviewSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedTeamId && (
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {t('refresh')}
            </Button>
          )}
          <TeamQuickActions teamId={selectedTeamId} />
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
              />

              {/* Two-column layout */}
              <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                {/* Left: Attendance list */}
                <TeamAttendanceList
                  members={members}
                  dayViewsData={dayViewsData}
                  dayViewsLoading={dayViewsLoading || teamLoading}
                  date={today}
                />

                {/* Right: Upcoming absences */}
                <TeamUpcomingAbsences members={members} />
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
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-[280px]" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  )
}

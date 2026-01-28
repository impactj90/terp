'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Calendar, CalendarPlus, FileText, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TeamQuickActionsProps {
  teamId?: string
}

/**
 * Quick action buttons for team-level navigation.
 * Provides shortcuts to manage teams, absences, and timesheets.
 */
export function TeamQuickActions({ teamId: _teamId }: TeamQuickActionsProps) {
  const t = useTranslations('teamOverview')

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" asChild className="gap-2">
        <Link href="/absences">
          <CalendarPlus className="h-4 w-4" />
          {t('addAbsence')}
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild className="gap-2">
        <Link href="/admin/teams">
          <Users className="h-4 w-4" />
          {t('manageTeams')}
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild className="gap-2">
        <Link href="/absences">
          <Calendar className="h-4 w-4" />
          {t('manageAbsences')}
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild className="gap-2">
        <Link href="/timesheet">
          <FileText className="h-4 w-4" />
          {t('viewTimesheets')}
        </Link>
      </Button>
    </div>
  )
}

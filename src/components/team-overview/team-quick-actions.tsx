'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Calendar, CalendarPlus, FileText, MoreHorizontal, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface TeamQuickActionsProps {
  teamId?: string
}

/**
 * Quick action dropdown for team-level navigation.
 * Provides shortcuts to manage teams, absences, and timesheets.
 */
export function TeamQuickActions({ teamId: _teamId }: TeamQuickActionsProps) {
  const t = useTranslations('teamOverview')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 w-9 p-0">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">{t('moreActions')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/absences" className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" />
            {t('addAbsence')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/absences" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {t('manageAbsences')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/teams" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('manageTeams')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/timesheet" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t('viewTimesheets')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

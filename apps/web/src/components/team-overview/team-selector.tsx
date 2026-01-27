'use client'

import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { components } from '@/lib/api/types'

type Team = components['schemas']['Team']

interface TeamSelectorProps {
  teams: Team[]
  selectedTeamId: string | undefined
  onSelectTeam: (teamId: string) => void
  isLoading?: boolean
}

/**
 * Team selector dropdown for the team overview page.
 * Shows active teams with member counts.
 */
export function TeamSelector({ teams, selectedTeamId, onSelectTeam, isLoading }: TeamSelectorProps) {
  const t = useTranslations('teamOverview')

  return (
    <Select
      value={selectedTeamId ?? ''}
      onValueChange={onSelectTeam}
      disabled={isLoading}
    >
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder={t('selectTeam')} />
      </SelectTrigger>
      <SelectContent>
        {teams.map((team) => (
          <SelectItem key={team.id} value={team.id}>
            {team.name}
            {team.member_count ? ` (${team.member_count})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

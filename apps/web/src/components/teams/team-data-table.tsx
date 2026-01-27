'use client'

import * as React from 'react'
import { MoreHorizontal, Eye, Edit, Users, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { TeamStatusBadge } from './team-status-badge'
import type { components } from '@/lib/api/types'

type Team = components['schemas']['Team']

interface TeamDataTableProps {
  /** List of teams to display */
  teams: Team[]
  /** Whether the table is loading */
  isLoading: boolean
  /** Set of selected team IDs */
  selectedIds: Set<string>
  /** Callback when selection changes */
  onSelectIds: (ids: Set<string>) => void
  /** Callback when view details is clicked */
  onView: (team: Team) => void
  /** Callback when edit is clicked */
  onEdit: (team: Team) => void
  /** Callback when delete is clicked */
  onDelete: (team: Team) => void
  /** Callback when manage members is clicked */
  onManageMembers: (team: Team) => void
}

/**
 * Data table for displaying teams with selection and actions.
 */
export function TeamDataTable({
  teams,
  isLoading,
  selectedIds,
  onSelectIds,
  onView,
  onEdit,
  onDelete,
  onManageMembers,
}: TeamDataTableProps) {
  const t = useTranslations('adminTeams')

  // Handle select all toggle
  const allSelected = teams.length > 0 && teams.every((t) => selectedIds.has(t.id))
  const someSelected = teams.some((t) => selectedIds.has(t.id)) && !allSelected

  const handleSelectAll = () => {
    if (allSelected) {
      const newSet = new Set(selectedIds)
      teams.forEach((t) => newSet.delete(t.id))
      onSelectIds(newSet)
    } else {
      const newSet = new Set(selectedIds)
      teams.forEach((t) => newSet.add(t.id))
      onSelectIds(newSet)
    }
  }

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    onSelectIds(newSet)
  }

  if (isLoading) {
    return <TeamDataTableSkeleton />
  }

  if (teams.length === 0) {
    return null // Let the parent handle empty state
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={handleSelectAll}
              aria-label={t('selectAll')}
            />
          </TableHead>
          <TableHead>{t('columnName')}</TableHead>
          <TableHead>{t('columnDepartment')}</TableHead>
          <TableHead>{t('columnLeader')}</TableHead>
          <TableHead className="w-24">{t('columnMembers')}</TableHead>
          <TableHead className="w-24">{t('columnStatus')}</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">{t('columnActions')}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {teams.map((team) => (
          <TableRow
            key={team.id}
            data-state={selectedIds.has(team.id) ? 'selected' : undefined}
            className="cursor-pointer"
            onClick={() => onView(team)}
          >
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedIds.has(team.id)}
                onCheckedChange={() => handleSelectOne(team.id)}
                aria-label={t('selectTeam', { name: team.name })}
              />
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{team.name}</span>
                {team.description && (
                  <span className="text-sm text-muted-foreground line-clamp-1">
                    {team.description}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {team.department?.name || '-'}
            </TableCell>
            <TableCell>
              {team.leader ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {team.leader.first_name[0]}
                    {team.leader.last_name[0]}
                  </div>
                  <span className="text-sm">
                    {team.leader.first_name} {team.leader.last_name}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{team.member_count ?? team.members?.length ?? 0}</span>
              </div>
            </TableCell>
            <TableCell>
              <TeamStatusBadge isActive={team.is_active} />
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">{t('columnActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(team)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('viewDetails')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(team)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onManageMembers(team)}>
                    <Users className="mr-2 h-4 w-4" />
                    {t('manageMembers')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(team)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TeamDataTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12"><Skeleton className="h-4 w-4" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-24"><Skeleton className="h-4 w-16" /></TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-4" /></TableCell>
            <TableCell><Skeleton className="h-4 w-40" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
            <TableCell><Skeleton className="h-8 w-8" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

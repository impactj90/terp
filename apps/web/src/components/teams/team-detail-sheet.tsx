'use client'

import * as React from 'react'
import { Edit, Trash2, Users, UserPlus, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { TeamStatusBadge } from './team-status-badge'
import { MemberRoleBadge } from './member-role-badge'
import { useTeam } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Team = components['schemas']['Team']

export interface TeamDetailSheetProps {
  /** Team ID to fetch details for */
  teamId: string | null
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Callback when edit is clicked */
  onEdit: (team: Team) => void
  /** Callback when delete is clicked */
  onDelete: (team: Team) => void
  /** Callback when manage members is clicked */
  onManageMembers: (team: Team) => void
}

interface DetailRowProps {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
}

function DetailRow({ label, value, icon }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      {icon && <div className="text-muted-foreground mt-0.5">{icon}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || '-'}</p>
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-medium text-muted-foreground mb-2 mt-4 first:mt-0">
      {children}
    </h3>
  )
}

/**
 * Sheet for displaying team details with member list.
 */
export function TeamDetailSheet({
  teamId,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onManageMembers,
}: TeamDetailSheetProps) {
  // Fetch team details with members
  const { data: team, isLoading, isFetching } = useTeam(teamId ?? '', open && !!teamId)

  const showSkeleton = isLoading || isFetching || (teamId && !team)

  const handleEdit = () => {
    if (team) {
      onEdit(team)
    }
  }

  const handleDelete = () => {
    if (team) {
      onDelete(team)
    }
  }

  const handleManageMembers = () => {
    if (team) {
      onManageMembers(team)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        {showSkeleton ? (
          <TeamDetailSkeleton />
        ) : team ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="truncate">{team.name}</SheetTitle>
                    <TeamStatusBadge isActive={team.is_active} />
                  </div>
                  {team.description && (
                    <SheetDescription className="line-clamp-2 mt-1">
                      {team.description}
                    </SheetDescription>
                  )}
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 -mx-4 px-4">
              <div className="py-4 space-y-1">
                {/* Organization */}
                <SectionHeader>Organization</SectionHeader>
                <DetailRow
                  label="Department"
                  value={team.department?.name}
                  icon={<Building2 className="h-4 w-4" />}
                />
                <DetailRow
                  label="Team Leader"
                  value={
                    team.leader
                      ? `${team.leader.first_name} ${team.leader.last_name}`
                      : undefined
                  }
                />

                {/* Team Members */}
                <SectionHeader>
                  <div className="flex items-center justify-between">
                    <span>Team Members ({team.members?.length ?? 0})</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleManageMembers}
                      className="h-7 px-2"
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-1" />
                      Manage
                    </Button>
                  </div>
                </SectionHeader>

                {team.members && team.members.length > 0 ? (
                  <div className="space-y-2">
                    {team.members.map((member) => (
                      <div
                        key={member.employee_id}
                        className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-sm font-medium">
                            {member.employee?.first_name?.[0] ?? '?'}
                            {member.employee?.last_name?.[0] ?? '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {member.employee
                                ? `${member.employee.first_name} ${member.employee.last_name}`
                                : 'Unknown Employee'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {member.employee?.department?.name || 'No department'}
                            </p>
                          </div>
                        </div>
                        <MemberRoleBadge role={member.role} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No members yet</p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={handleManageMembers}
                      className="mt-1"
                    >
                      Add members
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>

            <SheetFooter className="flex-row gap-2 border-t pt-4">
              <Button variant="outline" onClick={handleManageMembers} className="flex-1">
                <Users className="mr-2 h-4 w-4" />
                Manage Members
              </Button>
              <Button variant="outline" onClick={handleEdit} className="flex-1">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Team Details</SheetTitle>
              <SheetDescription>Team information</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground opacity-50" />
              <p className="mt-4 text-muted-foreground">Team not found</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function TeamDetailSkeleton() {
  return (
    <>
      <SheetHeader>
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </SheetHeader>
      <div className="space-y-4 py-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </>
  )
}

'use client'

import * as React from 'react'
import { Loader2, Search, UserPlus, X, UserMinus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useTeam,
  useEmployees,
  useAddTeamMember,
  useUpdateTeamMember,
  useRemoveTeamMember,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Team = components['schemas']['Team']
type TeamMember = components['schemas']['TeamMember']
type TeamMemberRole = components['schemas']['TeamMemberRole']

interface MemberManagementSheetProps {
  /** Team to manage members for */
  team: Team | null
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
}

/**
 * Sheet for managing team members - add, remove, change roles.
 */
export function MemberManagementSheet({
  team,
  open,
  onOpenChange,
}: MemberManagementSheetProps) {
  const [search, setSearch] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  // Fetch team with fresh member data
  const { data: teamData, isLoading: teamLoading } = useTeam(team?.id ?? '', open && !!team)

  // Fetch all active employees for adding
  const { data: employeesData, isLoading: employeesLoading } = useEmployees({
    limit: 200,
    active: true,
    enabled: open,
  })

  // Mutations
  const addMemberMutation = useAddTeamMember()
  const updateMemberMutation = useUpdateTeamMember()
  const removeMemberMutation = useRemoveTeamMember()

  const members = teamData?.members ?? []
  const memberIds = new Set(members.map((m) => m.employee_id))
  const allEmployees = employeesData?.data ?? []

  // Filter employees not already in team
  const availableEmployees = allEmployees.filter(
    (emp) =>
      !memberIds.has(emp.id) &&
      (search === '' ||
        emp.first_name.toLowerCase().includes(search.toLowerCase()) ||
        emp.last_name.toLowerCase().includes(search.toLowerCase()) ||
        emp.personnel_number.toLowerCase().includes(search.toLowerCase()))
  )

  // Reset state when opening
  React.useEffect(() => {
    if (open) {
      setSearch('')
      setError(null)
    }
  }, [open])

  const handleAddMember = async (employeeId: string, role: TeamMemberRole = 'member') => {
    if (!team) return
    setError(null)

    try {
      await addMemberMutation.mutateAsync({
        path: { id: team.id },
        body: { employee_id: employeeId, role },
      })
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Failed to add member')
    }
  }

  const handleUpdateRole = async (employeeId: string, newRole: TeamMemberRole) => {
    if (!team) return
    setError(null)

    try {
      await updateMemberMutation.mutateAsync({
        path: { id: team.id, employee_id: employeeId },
        body: { role: newRole },
      })
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Failed to update role')
    }
  }

  const handleRemoveMember = async (employeeId: string) => {
    if (!team) return
    setError(null)

    try {
      await removeMemberMutation.mutateAsync({
        path: { id: team.id, employee_id: employeeId },
      })
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Failed to remove member')
    }
  }

  const isLoading = teamLoading || employeesLoading
  const isMutating = addMemberMutation.isPending || updateMemberMutation.isPending || removeMemberMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Manage Team Members</SheetTitle>
          <SheetDescription>
            {team ? `Add or remove members from ${team.name}` : 'Manage team members'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col min-h-0 -mx-4 px-4">
          {/* Error */}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Current Members Section */}
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2">
              Current Members ({members.length})
            </h3>
            <ScrollArea className="h-[200px] border rounded-md">
              {members.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No members yet
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {members.map((member) => (
                    <MemberRow
                      key={member.employee_id}
                      member={member}
                      onRoleChange={(role) => handleUpdateRole(member.employee_id, role)}
                      onRemove={() => handleRemoveMember(member.employee_id)}
                      disabled={isMutating}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Add Members Section */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h3 className="text-sm font-medium mb-2">Add Members</h3>

            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees..."
                className="pl-9"
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setSearch('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Available Employees */}
            <ScrollArea className="flex-1 border rounded-md">
              {isLoading ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                  Loading employees...
                </div>
              ) : availableEmployees.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  {search ? 'No employees match your search' : 'All employees are already members'}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {availableEmployees.map((employee) => (
                    <div
                      key={employee.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                          {employee.first_name[0]}
                          {employee.last_name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {employee.first_name} {employee.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {employee.department?.name || employee.personnel_number}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddMember(employee.id)}
                        disabled={isMutating}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface MemberRowProps {
  member: TeamMember
  onRoleChange: (role: TeamMemberRole) => void
  onRemove: () => void
  disabled: boolean
}

function MemberRow({ member, onRoleChange, onRemove, disabled }: MemberRowProps) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-sm font-medium">
          {member.employee?.first_name?.[0] ?? '?'}
          {member.employee?.last_name?.[0] ?? '?'}
        </div>
        <div>
          <p className="text-sm font-medium">
            {member.employee
              ? `${member.employee.first_name} ${member.employee.last_name}`
              : 'Unknown'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={member.role}
          onValueChange={(value) => onRoleChange(value as TeamMemberRole)}
          disabled={disabled}
        >
          <SelectTrigger className="w-[100px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="deputy">Deputy</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={disabled}
        >
          <UserMinus className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}

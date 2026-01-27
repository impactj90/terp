# Implementation Plan: NOK-227 - Team Management with Member Assignment

**Date**: 2026-01-26
**Ticket**: NOK-227
**Status**: Ready for Implementation

---

## Overview

Implement a team management page in the Next.js frontend (`apps/web/`) that allows administrators to:
- View, create, edit, and delete teams
- Assign employees as team members with roles (member, lead, deputy)
- Filter teams by department and active status
- View team details including member list

This plan follows the established patterns from the employee management page.

---

## Prerequisites

- API endpoints for teams already exist (verified in OpenAPI spec)
- Generated TypeScript types available in `apps/web/src/lib/api/types.ts`
- All UI components (Sheet, Card, Table, etc.) available in `apps/web/src/components/ui/`

---

## Phase 1: API Hooks

**Goal**: Create type-safe hooks for team CRUD operations and member management.

### File to Create

**`/home/tolga/projects/terp/apps/web/src/hooks/api/use-teams.ts`**

### Implementation

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

// ==================== Query Hooks ====================

interface UseTeamsOptions {
  limit?: number
  page?: number
  departmentId?: string
  isActive?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of teams.
 */
export function useTeams(options: UseTeamsOptions = {}) {
  const { limit = 20, page, departmentId, isActive, enabled = true } = options

  return useApiQuery('/teams', {
    params: {
      limit,
      page,
      department_id: departmentId,
      is_active: isActive,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single team by ID with members.
 */
export function useTeam(id: string, enabled = true) {
  return useApiQuery('/teams/{id}', {
    path: { id },
    params: { include_members: true },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch team members.
 */
export function useTeamMembers(teamId: string, enabled = true) {
  return useApiQuery('/teams/{id}/members', {
    path: { id: teamId },
    enabled: enabled && !!teamId,
  })
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new team.
 */
export function useCreateTeam() {
  return useApiMutation('/teams', 'post', {
    invalidateKeys: [['/teams']],
  })
}

/**
 * Hook to update an existing team.
 */
export function useUpdateTeam() {
  return useApiMutation('/teams/{id}', 'put', {
    invalidateKeys: [['/teams']],
  })
}

/**
 * Hook to delete a team.
 */
export function useDeleteTeam() {
  return useApiMutation('/teams/{id}', 'delete', {
    invalidateKeys: [['/teams']],
  })
}

/**
 * Hook to add a member to a team.
 */
export function useAddTeamMember() {
  return useApiMutation('/teams/{id}/members', 'post', {
    invalidateKeys: [['/teams']],
  })
}

/**
 * Hook to update a team member's role.
 */
export function useUpdateTeamMember() {
  return useApiMutation('/teams/{id}/members/{employee_id}', 'put', {
    invalidateKeys: [['/teams']],
  })
}

/**
 * Hook to remove a member from a team.
 */
export function useRemoveTeamMember() {
  return useApiMutation('/teams/{id}/members/{employee_id}', 'delete', {
    invalidateKeys: [['/teams']],
  })
}
```

### File to Modify

**`/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`**

Add exports:
```typescript
// Teams
export {
  useTeams,
  useTeam,
  useTeamMembers,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useAddTeamMember,
  useUpdateTeamMember,
  useRemoveTeamMember,
} from './use-teams'
```

### Verification

1. Run `cd apps/web && pnpm tsc --noEmit` - should have no type errors
2. Import hooks in a test component and verify autocomplete works

---

## Phase 2: Basic Components (StatusBadge, RoleBadge)

**Goal**: Create reusable badge components for team status and member roles.

### Files to Create

**Directory**: `/home/tolga/projects/terp/apps/web/src/components/teams/`

#### 2.1 Team Status Badge

**`/home/tolga/projects/terp/apps/web/src/components/teams/team-status-badge.tsx`**

```typescript
'use client'

import { Badge } from '@/components/ui/badge'

interface TeamStatusBadgeProps {
  isActive: boolean
}

/**
 * Badge component for displaying team active/inactive status.
 */
export function TeamStatusBadge({ isActive }: TeamStatusBadgeProps) {
  if (isActive) {
    return (
      <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
        Active
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      Inactive
    </Badge>
  )
}
```

#### 2.2 Member Role Badge

**`/home/tolga/projects/terp/apps/web/src/components/teams/member-role-badge.tsx`**

```typescript
'use client'

import { Badge } from '@/components/ui/badge'
import type { components } from '@/lib/api/types'

type TeamMemberRole = components['schemas']['TeamMemberRole']

interface MemberRoleBadgeProps {
  role: TeamMemberRole
}

const roleConfig: Record<TeamMemberRole, { label: string; className: string }> = {
  lead: {
    label: 'Lead',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  deputy: {
    label: 'Deputy',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  member: {
    label: 'Member',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
}

/**
 * Badge component for displaying team member role.
 */
export function MemberRoleBadge({ role }: MemberRoleBadgeProps) {
  const config = roleConfig[role]

  return (
    <Badge variant="secondary" className={config.className}>
      {config.label}
    </Badge>
  )
}
```

#### 2.3 Index File

**`/home/tolga/projects/terp/apps/web/src/components/teams/index.ts`**

```typescript
export { TeamStatusBadge } from './team-status-badge'
export { MemberRoleBadge } from './member-role-badge'
```

### Verification

1. Run `cd apps/web && pnpm tsc --noEmit` - should have no type errors
2. Import components and render in isolation to verify visual appearance

---

## Phase 3: Data Table Component

**Goal**: Create a table component for displaying teams with selection and row actions.

### File to Create

**`/home/tolga/projects/terp/apps/web/src/components/teams/team-data-table.tsx`**

### Implementation

```typescript
'use client'

import * as React from 'react'
import { MoreHorizontal, Eye, Edit, Users, Trash2 } from 'lucide-react'
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
              aria-label="Select all"
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Leader</TableHead>
          <TableHead className="w-24">Members</TableHead>
          <TableHead className="w-24">Status</TableHead>
          <TableHead className="w-16">
            <span className="sr-only">Actions</span>
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
                aria-label={`Select ${team.name}`}
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
                <span>{team.members?.length ?? 0}</span>
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
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(team)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(team)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onManageMembers(team)}>
                    <Users className="mr-2 h-4 w-4" />
                    Manage Members
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(team)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
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
```

### Update Index

Add to `/home/tolga/projects/terp/apps/web/src/components/teams/index.ts`:
```typescript
export { TeamDataTable } from './team-data-table'
```

### Verification

1. Run `cd apps/web && pnpm tsc --noEmit` - should have no type errors
2. Component should handle loading, empty, and data states

---

## Phase 4: Team Form Sheet (Create/Edit)

**Goal**: Create a side panel form for creating and editing teams.

### File to Create

**`/home/tolga/projects/terp/apps/web/src/components/teams/team-form-sheet.tsx`**

### Implementation

```typescript
'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
  useCreateTeam,
  useUpdateTeam,
  useDepartments,
  useEmployees,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Team = components['schemas']['Team']

interface TeamFormSheetProps {
  /** Whether the sheet is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Team to edit (null = create mode) */
  team?: Team | null
  /** Callback when form submits successfully */
  onSuccess?: () => void
}

interface FormState {
  name: string
  description: string
  departmentId: string
  leaderEmployeeId: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  departmentId: '',
  leaderEmployeeId: '',
  isActive: true,
}

function validateForm(form: FormState): string[] {
  const errors: string[] = []

  if (!form.name.trim()) {
    errors.push('Team name is required')
  }

  if (form.name.length > 255) {
    errors.push('Team name must be 255 characters or less')
  }

  return errors
}

/**
 * Sheet form for creating or editing a team.
 */
export function TeamFormSheet({
  open,
  onOpenChange,
  team,
  onSuccess,
}: TeamFormSheetProps) {
  const isEdit = !!team
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Mutations
  const createMutation = useCreateTeam()
  const updateMutation = useUpdateTeam()

  // Reference data
  const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({ enabled: open })
  const { data: employeesData, isLoading: loadingEmployees } = useEmployees({
    limit: 100,
    active: true,
    enabled: open
  })

  const departments = departmentsData?.data ?? []
  const employees = employeesData?.data ?? []

  // Reset form when opening/closing or team changes
  React.useEffect(() => {
    if (open) {
      if (team) {
        setForm({
          name: team.name,
          description: team.description || '',
          departmentId: team.department_id || '',
          leaderEmployeeId: team.leader_employee_id || '',
          isActive: team.is_active,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, team])

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && team) {
        await updateMutation.mutateAsync({
          path: { id: team.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            department_id: form.departmentId || undefined,
            leader_employee_id: form.leaderEmployeeId || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            department_id: form.departmentId || undefined,
            leader_employee_id: form.leaderEmployeeId || undefined,
            is_active: form.isActive,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? `Failed to ${isEdit ? 'update' : 'create'} team`)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const isLoadingReferenceData = loadingDepartments || loadingEmployees

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Team' : 'New Team'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update team information and settings.'
              : 'Create a new team for organizing employees.'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Team Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Team Information</h3>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="e.g., Frontend Team"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder="Brief description of the team's purpose..."
                  rows={3}
                />
              </div>
            </div>

            {/* Organization */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Organization</h3>

              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={form.departmentId || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({
                    ...prev,
                    departmentId: value === '__none__' ? '' : value
                  }))}
                  disabled={isSubmitting || isLoadingReferenceData}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Team Leader</Label>
                <Select
                  value={form.leaderEmployeeId || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({
                    ...prev,
                    leaderEmployeeId: value === '__none__' ? '' : value
                  }))}
                  disabled={isSubmitting || isLoadingReferenceData}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team leader" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Status</h3>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive teams are hidden from most views
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Team'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

### Update Index

Add to `/home/tolga/projects/terp/apps/web/src/components/teams/index.ts`:
```typescript
export { TeamFormSheet } from './team-form-sheet'
```

### Verification

1. Run `cd apps/web && pnpm tsc --noEmit` - should have no type errors
2. Test create and edit modes in isolation

---

## Phase 5: Team Detail Sheet with Members

**Goal**: Create a side panel for viewing team details including member list with role management.

### File to Create

**`/home/tolga/projects/terp/apps/web/src/components/teams/team-detail-sheet.tsx`**

### Implementation

```typescript
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
```

### Update Index

Add to `/home/tolga/projects/terp/apps/web/src/components/teams/index.ts`:
```typescript
export { TeamDetailSheet } from './team-detail-sheet'
```

### Verification

1. Run `cd apps/web && pnpm tsc --noEmit` - should have no type errors
2. Verify member list displays correctly with role badges

---

## Phase 6: Member Management Sheet

**Goal**: Create a sheet for adding/removing team members and managing their roles.

### File to Create

**`/home/tolga/projects/terp/apps/web/src/components/teams/member-management-sheet.tsx`**

### Implementation

```typescript
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
import { MemberRoleBadge } from './member-role-badge'
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
```

### Update Index

Add to `/home/tolga/projects/terp/apps/web/src/components/teams/index.ts`:
```typescript
export { MemberManagementSheet } from './member-management-sheet'
```

### Verification

1. Run `cd apps/web && pnpm tsc --noEmit` - should have no type errors
2. Test adding, removing, and updating member roles

---

## Phase 7: Teams Page Integration

**Goal**: Create the main teams admin page that ties all components together.

### File to Create

**`/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/teams/page.tsx`**

### Implementation

```typescript
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users, X } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import { useTeams, useDeleteTeam, useDepartments } from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { Pagination } from '@/components/ui/pagination'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TeamDataTable,
  TeamFormSheet,
  TeamDetailSheet,
  MemberManagementSheet,
} from '@/components/teams'
import type { components } from '@/lib/api/types'

type Team = components['schemas']['Team']

export default function TeamsPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Pagination and filters
  const [page, setPage] = React.useState(1)
  const [limit, setLimit] = React.useState(20)
  const [search, setSearch] = React.useState('')
  const [departmentFilter, setDepartmentFilter] = React.useState<string | undefined>(undefined)
  const [activeFilter, setActiveFilter] = React.useState<boolean | undefined>(undefined)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTeam, setEditTeam] = React.useState<Team | null>(null)
  const [viewTeam, setViewTeam] = React.useState<Team | null>(null)
  const [deleteTeam, setDeleteTeam] = React.useState<Team | null>(null)
  const [manageMembersTeam, setManageMembersTeam] = React.useState<Team | null>(null)

  // Fetch teams
  const { data, isLoading, isFetching } = useTeams({
    page,
    limit,
    departmentId: departmentFilter,
    isActive: activeFilter,
    enabled: !authLoading && isAdmin,
  })

  // Fetch departments for filter
  const { data: departmentsData } = useDepartments({ enabled: !authLoading && isAdmin })
  const departments = departmentsData?.data ?? []

  // Delete mutation
  const deleteMutation = useDeleteTeam()

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1)
  }, [search, departmentFilter, activeFilter])

  // Clear selection when page changes
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [page, search, departmentFilter, activeFilter])

  // Redirect if not admin
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  // Filter teams by search (client-side since API may not support text search)
  const allTeams = data?.items ?? []
  const teams = search
    ? allTeams.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.description?.toLowerCase().includes(search.toLowerCase())
      )
    : allTeams
  const total = data?.items?.length ?? 0
  const totalPages = Math.ceil(total / limit)

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit)
    setPage(1)
  }

  const handleView = (team: Team) => {
    setViewTeam(team)
  }

  const handleEdit = (team: Team) => {
    setEditTeam(team)
    setViewTeam(null)
  }

  const handleDelete = (team: Team) => {
    setDeleteTeam(team)
  }

  const handleManageMembers = (team: Team) => {
    setManageMembersTeam(team)
    setViewTeam(null)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTeam) return

    try {
      await deleteMutation.mutateAsync({
        path: { id: deleteTeam.id },
      })
      setDeleteTeam(null)
      if (selectedIds.has(deleteTeam.id)) {
        const newSet = new Set(selectedIds)
        newSet.delete(deleteTeam.id)
        setSelectedIds(newSet)
      }
    } catch {
      // Error handled by mutation
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditTeam(null)
  }

  // Check for any active filters
  const hasFilters = Boolean(search) || departmentFilter !== undefined || activeFilter !== undefined

  if (authLoading) {
    return <TeamsPageSkeleton />
  }

  if (!isAdmin) {
    return null // Will redirect
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground">
            Manage teams and assign members
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Team
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search teams..."
          className="w-full sm:w-80"
          disabled={isFetching}
        />

        <Select
          value={departmentFilter ?? 'all'}
          onValueChange={(value) => {
            setDepartmentFilter(value === 'all' ? undefined : value)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={activeFilter === undefined ? 'all' : activeFilter ? 'active' : 'inactive'}
          onValueChange={(value) => {
            if (value === 'all') {
              setActiveFilter(undefined)
            } else {
              setActiveFilter(value === 'active')
            }
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setDepartmentFilter(undefined)
              setActiveFilter(undefined)
            }}
          >
            <X className="mr-2 h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-96" />
            </div>
          ) : teams.length === 0 ? (
            <EmptyState
              hasFilters={hasFilters}
              onCreateClick={() => setCreateOpen(true)}
            />
          ) : (
            <TeamDataTable
              teams={teams}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onSelectIds={setSelectedIds}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onManageMembers={handleManageMembers}
            />
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={handleLimitChange}
          disabled={isFetching}
        />
      )}

      {/* Create/Edit Form */}
      <TeamFormSheet
        open={createOpen || !!editTeam}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditTeam(null)
          }
        }}
        team={editTeam}
        onSuccess={handleFormSuccess}
      />

      {/* Detail View */}
      <TeamDetailSheet
        teamId={viewTeam?.id ?? null}
        open={!!viewTeam}
        onOpenChange={(open) => {
          if (!open) {
            setViewTeam(null)
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onManageMembers={handleManageMembers}
      />

      {/* Member Management */}
      <MemberManagementSheet
        team={manageMembersTeam}
        open={!!manageMembersTeam}
        onOpenChange={(open) => {
          if (!open) {
            setManageMembersTeam(null)
          }
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTeam}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTeam(null)
          }
        }}
        title="Delete Team"
        description={
          deleteTeam
            ? `Are you sure you want to delete "${deleteTeam.name}"? This action cannot be undone and will remove all member associations.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function EmptyState({
  hasFilters,
  onCreateClick,
}: {
  hasFilters: boolean
  onCreateClick: () => void
}) {
  return (
    <div className="text-center py-12 px-6">
      <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">No teams found</h3>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? 'Try adjusting your search or filters'
          : 'Get started by creating your first team'}
      </p>
      {!hasFilters && (
        <Button className="mt-4" onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Create Team
        </Button>
      )}
    </div>
  )
}

function TeamsPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Table */}
      <Skeleton className="h-96" />

      {/* Pagination */}
      <div className="flex justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-64" />
      </div>
    </div>
  )
}
```

### Verification

1. Run `cd apps/web && pnpm tsc --noEmit` - should have no type errors
2. Navigate to `/admin/teams` and verify:
   - Team list loads correctly
   - Filters work (department, status, search)
   - Create team form opens and submits
   - Edit team form opens with existing data
   - View team detail sheet shows members
   - Member management sheet allows adding/removing
   - Delete confirmation works

---

## Phase 8: Navigation Integration

**Goal**: Add Teams link to the sidebar navigation.

### File to Modify

**`/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`**

### Changes

1. Add `UsersRound` import from lucide-react (or use existing `Users` icon):

```typescript
import {
  // ... existing imports
  UsersRound,  // For teams (or use existing icon)
} from 'lucide-react'
```

2. Add Teams nav item to the Management section (after Employees):

```typescript
{
  title: 'Management',
  roles: ['admin'],
  items: [
    {
      title: 'Employees',
      href: '/admin/employees',
      icon: Users,
      roles: ['admin'],
      description: 'Manage employee records',
    },
    {
      title: 'Teams',
      href: '/admin/teams',
      icon: UsersRound,  // or Users2, or another appropriate icon
      roles: ['admin'],
      description: 'Manage teams and members',
    },
    // ... rest of items
  ],
}
```

### Verification

1. Run `cd apps/web && pnpm tsc --noEmit` - should have no type errors
2. Verify Teams link appears in sidebar for admin users
3. Verify navigation to `/admin/teams` works correctly

---

## Final Verification Checklist

After all phases are complete, run through this checklist:

### Build & Types
- [ ] `cd apps/web && pnpm tsc --noEmit` passes with no errors
- [ ] `cd apps/web && pnpm build` succeeds

### Functionality
- [ ] Teams list page loads at `/admin/teams`
- [ ] Create new team with name, description, department, leader
- [ ] Edit existing team
- [ ] Delete team with confirmation
- [ ] View team details in side panel
- [ ] Add members to team
- [ ] Remove members from team
- [ ] Change member roles (member, lead, deputy)
- [ ] Filter by department
- [ ] Filter by active status
- [ ] Search teams by name
- [ ] Pagination works correctly
- [ ] Row selection works
- [ ] Navigation link in sidebar

### UI/UX
- [ ] Loading states show skeletons
- [ ] Empty states show appropriate messages
- [ ] Error states display error messages
- [ ] Forms validate required fields
- [ ] Responsive layout works on mobile

---

## Files Summary

### New Files to Create

1. `/home/tolga/projects/terp/apps/web/src/hooks/api/use-teams.ts`
2. `/home/tolga/projects/terp/apps/web/src/components/teams/index.ts`
3. `/home/tolga/projects/terp/apps/web/src/components/teams/team-status-badge.tsx`
4. `/home/tolga/projects/terp/apps/web/src/components/teams/member-role-badge.tsx`
5. `/home/tolga/projects/terp/apps/web/src/components/teams/team-data-table.tsx`
6. `/home/tolga/projects/terp/apps/web/src/components/teams/team-form-sheet.tsx`
7. `/home/tolga/projects/terp/apps/web/src/components/teams/team-detail-sheet.tsx`
8. `/home/tolga/projects/terp/apps/web/src/components/teams/member-management-sheet.tsx`
9. `/home/tolga/projects/terp/apps/web/src/app/(dashboard)/admin/teams/page.tsx`

### Files to Modify

1. `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts` - Add team hook exports
2. `/home/tolga/projects/terp/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` - Add Teams nav item

---

## Success Criteria

The implementation is complete when:

1. All TypeScript compilation passes without errors
2. Admin users can navigate to `/admin/teams` via sidebar
3. Full CRUD operations work for teams
4. Member management (add, remove, role changes) works
5. All filters and pagination function correctly
6. UI matches the established patterns from employee management
7. Proper loading and error states are displayed

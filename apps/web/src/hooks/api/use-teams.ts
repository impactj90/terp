import { useApiQuery, useApiMutation } from '@/hooks'

// ==================== Query Hooks ====================

interface UseTeamsOptions {
  limit?: number
  cursor?: string
  departmentId?: string
  isActive?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of teams.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useTeams({
 *   limit: 20,
 *   departmentId: 'dept-123',
 * })
 * ```
 */
export function useTeams(options: UseTeamsOptions = {}) {
  const { limit = 20, cursor, departmentId, isActive, enabled = true } = options

  return useApiQuery('/teams', {
    params: {
      limit,
      cursor,
      department_id: departmentId,
      is_active: isActive,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single team by ID with members.
 *
 * @example
 * ```tsx
 * const { data: team, isLoading } = useTeam(teamId)
 * ```
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
 *
 * @example
 * ```tsx
 * const { data: members, isLoading } = useTeamMembers(teamId)
 * ```
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
 *
 * @example
 * ```tsx
 * const createTeam = useCreateTeam()
 * createTeam.mutate({
 *   body: { name: 'Frontend Team', ... }
 * })
 * ```
 */
export function useCreateTeam() {
  return useApiMutation('/teams', 'post', {
    invalidateKeys: [['/teams']],
  })
}

/**
 * Hook to update an existing team.
 *
 * @example
 * ```tsx
 * const updateTeam = useUpdateTeam()
 * updateTeam.mutate({
 *   path: { id: teamId },
 *   body: { name: 'Updated Team Name' }
 * })
 * ```
 */
export function useUpdateTeam() {
  return useApiMutation('/teams/{id}', 'put', {
    invalidateKeys: [['/teams']],
  })
}

/**
 * Hook to delete a team.
 *
 * @example
 * ```tsx
 * const deleteTeam = useDeleteTeam()
 * deleteTeam.mutate({ path: { id: teamId } })
 * ```
 */
export function useDeleteTeam() {
  return useApiMutation('/teams/{id}', 'delete', {
    invalidateKeys: [['/teams']],
  })
}

/**
 * Hook to add a member to a team.
 *
 * @example
 * ```tsx
 * const addMember = useAddTeamMember()
 * addMember.mutate({
 *   path: { id: teamId },
 *   body: { employee_id: empId, role: 'member' }
 * })
 * ```
 */
export function useAddTeamMember() {
  return useApiMutation('/teams/{id}/members', 'post', {
    invalidateKeys: [['/teams'], ['/teams/{id}']],
  })
}

/**
 * Hook to update a team member's role.
 *
 * @example
 * ```tsx
 * const updateMember = useUpdateTeamMember()
 * updateMember.mutate({
 *   path: { id: teamId, employee_id: empId },
 *   body: { role: 'lead' }
 * })
 * ```
 */
export function useUpdateTeamMember() {
  return useApiMutation('/teams/{id}/members/{employee_id}', 'put', {
    invalidateKeys: [['/teams'], ['/teams/{id}']],
  })
}

/**
 * Hook to remove a member from a team.
 *
 * @example
 * ```tsx
 * const removeMember = useRemoveTeamMember()
 * removeMember.mutate({
 *   path: { id: teamId, employee_id: empId }
 * })
 * ```
 */
export function useRemoveTeamMember() {
  return useApiMutation('/teams/{id}/members/{employee_id}', 'delete', {
    invalidateKeys: [['/teams'], ['/teams/{id}']],
  })
}

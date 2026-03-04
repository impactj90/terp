import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseTeamsOptions {
  page?: number
  pageSize?: number
  limit?: number
  departmentId?: string
  isActive?: boolean
  search?: string
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of teams.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useTeams({
 *   pageSize: 20,
 *   departmentId: 'dept-123',
 * })
 * ```
 */
export function useTeams(options: UseTeamsOptions = {}) {
  const {
    page = 1,
    pageSize,
    limit,
    departmentId,
    isActive,
    search,
    enabled = true,
  } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.teams.list.queryOptions(
      {
        page,
        pageSize: pageSize ?? limit ?? 20,
        departmentId,
        isActive,
        search,
      },
      { enabled }
    )
  )
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
  const trpc = useTRPC()
  return useQuery(
    trpc.teams.getById.queryOptions(
      { id, includeMembers: true },
      { enabled: enabled && !!id }
    )
  )
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
  const trpc = useTRPC()
  return useQuery(
    trpc.teams.getMembers.queryOptions(
      { teamId },
      { enabled: enabled && !!teamId }
    )
  )
}

// ==================== Mutation Hooks ====================

/**
 * Hook to create a new team.
 *
 * @example
 * ```tsx
 * const createTeam = useCreateTeam()
 * createTeam.mutate({ name: 'Frontend Team' })
 * ```
 */
export function useCreateTeam() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.teams.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.teams.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to update an existing team.
 *
 * @example
 * ```tsx
 * const updateTeam = useUpdateTeam()
 * updateTeam.mutate({ id: teamId, name: 'Updated Team Name' })
 * ```
 */
export function useUpdateTeam() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.teams.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.teams.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to delete a team.
 *
 * @example
 * ```tsx
 * const deleteTeam = useDeleteTeam()
 * deleteTeam.mutate({ id: teamId })
 * ```
 */
export function useDeleteTeam() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.teams.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.teams.list.queryKey(),
      })
    },
  })
}

/**
 * Hook to add a member to a team.
 *
 * @example
 * ```tsx
 * const addMember = useAddTeamMember()
 * addMember.mutate({ teamId, employeeId, role: 'member' })
 * ```
 */
export function useAddTeamMember() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.teams.addMember.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.teams.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.teams.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.teams.getMembers.queryKey(),
      })
    },
  })
}

/**
 * Hook to update a team member's role.
 *
 * @example
 * ```tsx
 * const updateMember = useUpdateTeamMember()
 * updateMember.mutate({ teamId, employeeId, role: 'lead' })
 * ```
 */
export function useUpdateTeamMember() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.teams.updateMemberRole.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.teams.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.teams.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.teams.getMembers.queryKey(),
      })
    },
  })
}

/**
 * Hook to remove a member from a team.
 *
 * @example
 * ```tsx
 * const removeMember = useRemoveTeamMember()
 * removeMember.mutate({ teamId, employeeId })
 * ```
 */
export function useRemoveTeamMember() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.teams.removeMember.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.teams.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.teams.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.teams.getMembers.queryKey(),
      })
    },
  })
}

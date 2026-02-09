import { useApiQuery, useApiMutation } from '@/hooks'

interface UseUserGroupsOptions {
  active?: boolean
  enabled?: boolean
}

export function useUserGroups(options: UseUserGroupsOptions = {}) {
  const { active, enabled = true } = options

  return useApiQuery('/user-groups', {
    params: {
      active,
    },
    enabled,
  })
}

export function useUserGroup(id: string, enabled = true) {
  return useApiQuery('/user-groups/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateUserGroup() {
  return useApiMutation('/user-groups', 'post', {
    invalidateKeys: [['/user-groups'], ['/permissions']],
  })
}

export function useUpdateUserGroup() {
  return useApiMutation('/user-groups/{id}', 'patch', {
    invalidateKeys: [['/user-groups'], ['/user-groups/{id}'], ['/auth/permissions']],
  })
}

export function useDeleteUserGroup() {
  return useApiMutation('/user-groups/{id}', 'delete', {
    invalidateKeys: [['/user-groups'], ['/auth/permissions']],
  })
}

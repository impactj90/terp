import { useApiQuery, useApiMutation } from '@/hooks'

// --- Access Zones ---

interface UseAccessZonesOptions {
  enabled?: boolean
}

export function useAccessZones(options: UseAccessZonesOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/access-zones', { enabled })
}

export function useAccessZone(id: string, enabled = true) {
  return useApiQuery('/access-zones/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateAccessZone() {
  return useApiMutation('/access-zones', 'post', {
    invalidateKeys: [['/access-zones']],
  })
}

export function useUpdateAccessZone() {
  return useApiMutation('/access-zones/{id}', 'patch', {
    invalidateKeys: [['/access-zones']],
  })
}

export function useDeleteAccessZone() {
  return useApiMutation('/access-zones/{id}', 'delete', {
    invalidateKeys: [['/access-zones']],
  })
}

// --- Access Profiles ---

interface UseAccessProfilesOptions {
  enabled?: boolean
}

export function useAccessProfiles(options: UseAccessProfilesOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/access-profiles', { enabled })
}

export function useAccessProfile(id: string, enabled = true) {
  return useApiQuery('/access-profiles/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

export function useCreateAccessProfile() {
  return useApiMutation('/access-profiles', 'post', {
    invalidateKeys: [['/access-profiles']],
  })
}

export function useUpdateAccessProfile() {
  return useApiMutation('/access-profiles/{id}', 'patch', {
    invalidateKeys: [['/access-profiles']],
  })
}

export function useDeleteAccessProfile() {
  return useApiMutation('/access-profiles/{id}', 'delete', {
    invalidateKeys: [['/access-profiles']],
  })
}

// --- Employee Access Assignments ---

interface UseEmployeeAccessAssignmentsOptions {
  enabled?: boolean
}

export function useEmployeeAccessAssignments(options: UseEmployeeAccessAssignmentsOptions = {}) {
  const { enabled = true } = options
  return useApiQuery('/employee-access-assignments', {
    enabled,
  })
}

export function useCreateEmployeeAccessAssignment() {
  return useApiMutation('/employee-access-assignments', 'post', {
    invalidateKeys: [['/employee-access-assignments']],
  })
}

export function useUpdateEmployeeAccessAssignment() {
  return useApiMutation('/employee-access-assignments/{id}', 'patch', {
    invalidateKeys: [['/employee-access-assignments']],
  })
}

export function useDeleteEmployeeAccessAssignment() {
  return useApiMutation('/employee-access-assignments/{id}', 'delete', {
    invalidateKeys: [['/employee-access-assignments']],
  })
}

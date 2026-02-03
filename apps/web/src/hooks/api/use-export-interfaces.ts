import { useApiQuery, useApiMutation } from '@/hooks'

interface UseExportInterfacesOptions {
  activeOnly?: boolean
  enabled?: boolean
}

/**
 * Hook to fetch list of export interfaces.
 */
export function useExportInterfaces(options: UseExportInterfacesOptions = {}) {
  const { activeOnly, enabled = true } = options
  return useApiQuery('/export-interfaces', {
    params: {
      active_only: activeOnly,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single export interface by ID.
 */
export function useExportInterface(id: string, enabled = true) {
  return useApiQuery('/export-interfaces/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to fetch accounts assigned to an export interface.
 */
export function useExportInterfaceAccounts(id: string, enabled = true) {
  return useApiQuery('/export-interfaces/{id}/accounts', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new export interface.
 */
export function useCreateExportInterface() {
  return useApiMutation('/export-interfaces', 'post', {
    invalidateKeys: [['/export-interfaces']],
  })
}

/**
 * Hook to update an existing export interface.
 */
export function useUpdateExportInterface() {
  return useApiMutation('/export-interfaces/{id}', 'patch', {
    invalidateKeys: [
      ['/export-interfaces'],
      ['/export-interfaces/{id}'],
    ],
  })
}

/**
 * Hook to delete an export interface.
 */
export function useDeleteExportInterface() {
  return useApiMutation('/export-interfaces/{id}', 'delete', {
    invalidateKeys: [
      ['/export-interfaces'],
      ['/export-interfaces/{id}'],
    ],
  })
}

/**
 * Hook to set (replace all) accounts for an export interface.
 */
export function useSetExportInterfaceAccounts() {
  return useApiMutation('/export-interfaces/{id}/accounts', 'put', {
    invalidateKeys: [
      ['/export-interfaces/{id}/accounts'],
      ['/export-interfaces/{id}'],
      ['/export-interfaces'],
    ],
  })
}

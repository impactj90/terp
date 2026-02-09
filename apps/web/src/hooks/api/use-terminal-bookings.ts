import { useApiQuery, useApiMutation } from '@/hooks'

// --- Terminal Bookings ---

interface UseTerminalBookingsOptions {
  from?: string
  to?: string
  terminal_id?: string
  employee_id?: string
  status?: 'pending' | 'processed' | 'failed' | 'skipped'
  import_batch_id?: string
  limit?: number
  page?: number
  enabled?: boolean
}

export function useTerminalBookings(options: UseTerminalBookingsOptions = {}) {
  const { from, to, terminal_id, employee_id, status, import_batch_id, limit, page, enabled = true } = options
  return useApiQuery('/terminal-bookings', {
    params: { from: from!, to: to!, terminal_id, employee_id, status, import_batch_id, limit, page },
    enabled: enabled && !!from && !!to,
  })
}

// --- Import Trigger ---

export function useTriggerTerminalImport() {
  return useApiMutation('/terminal-bookings/import', 'post', {
    invalidateKeys: [['/terminal-bookings'], ['/import-batches']],
  })
}

// --- Import Batches ---

interface UseImportBatchesOptions {
  status?: 'pending' | 'processing' | 'completed' | 'failed'
  terminal_id?: string
  limit?: number
  page?: number
  enabled?: boolean
}

export function useImportBatches(options: UseImportBatchesOptions = {}) {
  const { status, terminal_id, limit, page, enabled = true } = options
  return useApiQuery('/import-batches', {
    params: { status, terminal_id, limit, page },
    enabled,
  })
}

export function useImportBatch(id: string, enabled = true) {
  return useApiQuery('/import-batches/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Terminal Bookings ---

interface UseTerminalBookingsOptions {
  from?: string
  to?: string
  terminalId?: string
  employeeId?: string
  status?: "pending" | "processed" | "failed" | "skipped"
  importBatchId?: string
  limit?: number
  page?: number
  enabled?: boolean
}

export function useTerminalBookings(
  options: UseTerminalBookingsOptions = {}
) {
  const {
    from,
    to,
    terminalId,
    employeeId,
    status,
    importBatchId,
    limit,
    page,
    enabled = true,
  } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.terminalBookings.list.queryOptions(
      {
        from,
        to,
        terminalId,
        employeeId,
        status,
        importBatchId,
        limit,
        page,
      },
      { enabled: enabled && !!from && !!to }
    )
  )
}

// --- Import Trigger ---

export function useTriggerTerminalImport() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.terminalBookings.import.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.terminalBookings.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.terminalBookings.batches.queryKey(),
      })
    },
  })
}

// --- Import Batches ---

interface UseImportBatchesOptions {
  status?: "pending" | "processing" | "completed" | "failed"
  terminalId?: string
  limit?: number
  page?: number
  enabled?: boolean
}

export function useImportBatches(options: UseImportBatchesOptions = {}) {
  const { status, terminalId, limit, page, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.terminalBookings.batches.queryOptions(
      { status, terminalId, limit, page },
      { enabled }
    )
  )
}

export function useImportBatch(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.terminalBookings.batch.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Re-export types inferred from tRPC router for backward compatibility ---

export type CorrectionAssistantError = {
  code: string
  severity: string
  message: string
  errorType: string
}

export type CorrectionAssistantItem = {
  dailyValueId: string
  employeeId: string
  employeeName: string
  departmentId: string | null
  departmentName: string | null
  valueDate: string
  errors: CorrectionAssistantError[]
}

export type CorrectionAssistantList = {
  data: CorrectionAssistantItem[]
  meta: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export type CorrectionMessage = {
  id: string
  tenantId: string
  code: string
  defaultText: string
  customText: string | null
  effectiveText: string
  severity: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CorrectionMessageList = {
  data: CorrectionMessage[]
}

export type UpdateCorrectionMessageRequest = {
  customText?: string | null
  severity?: 'error' | 'hint'
  isActive?: boolean
}

// --- Query Hooks ---

interface UseCorrectionAssistantItemsOptions {
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
  severity?: "error" | "hint"
  errorCode?: string
  limit?: number
  offset?: number
  enabled?: boolean
}

/**
 * Hook to fetch correction assistant items (daily values with errors) (tRPC).
 */
export function useCorrectionAssistantItems(options: UseCorrectionAssistantItemsOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.correctionAssistant.listItems.queryOptions(
      params,
      { enabled }
    )
  )
}

interface UseCorrectionMessagesOptions {
  severity?: "error" | "hint"
  isActive?: boolean
  code?: string
  enabled?: boolean
}

/**
 * Hook to fetch correction messages catalog (tRPC).
 */
export function useCorrectionMessages(options: UseCorrectionMessagesOptions = {}) {
  const { enabled = true, ...params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.correctionAssistant.listMessages.queryOptions(
      params,
      { enabled }
    )
  )
}

/**
 * Hook to fetch a single correction message by ID (tRPC).
 */
export function useCorrectionMessage(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.correctionAssistant.getMessage.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

// --- Mutation Hooks ---

/**
 * Hook to update a correction message (tRPC).
 */
export function useUpdateCorrectionMessage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.correctionAssistant.updateMessage.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.correctionAssistant.listMessages.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.correctionAssistant.getMessage.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.correctionAssistant.listItems.queryKey() })
    },
  })
}

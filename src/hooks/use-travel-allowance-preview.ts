import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

// ==================== Query Hooks ====================

interface UseTravelAllowancePreviewInput {
  ruleSetId: string
  tripType: "local" | "extended"
  distanceKm?: number
  durationMinutes?: number
  startDate?: string
  endDate?: string
  threeMonthActive?: boolean
}

interface UseTravelAllowancePreviewOptions {
  enabled?: boolean
}

/**
 * Hook to fetch a travel allowance preview calculation (tRPC).
 */
export function useTravelAllowancePreview(
  input: UseTravelAllowancePreviewInput,
  options: UseTravelAllowancePreviewOptions = {}
) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.travelAllowancePreview.preview.queryOptions(input, {
      enabled: enabled && !!input.ruleSetId,
    })
  )
}

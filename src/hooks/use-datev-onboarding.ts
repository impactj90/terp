import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

export function useDatevOnboardingStatus(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.datevOnboarding.getStatus.queryOptions(undefined, { enabled }),
  )
}

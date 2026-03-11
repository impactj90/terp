import { useTRPC } from "@/trpc"
import { useQueryClient } from "@tanstack/react-query"

export function useTimeDataInvalidation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: trpc.employees.dayView.queryKey() })
    queryClient.invalidateQueries({ queryKey: trpc.dailyValues.list.queryKey() })
    queryClient.invalidateQueries({ queryKey: trpc.dailyValues.listAll.queryKey() })
    queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.forEmployee.queryKey() })
    queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.yearOverview.queryKey() })
    queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.list.queryKey() })
  }
}

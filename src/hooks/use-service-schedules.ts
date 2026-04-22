import { useTRPC } from "@/trpc"
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

// --- Queries ---

export type ServiceScheduleListParams = {
  serviceObjectId?: string
  status?: "overdue" | "due_soon" | "ok" | "inactive"
  customerAddressId?: string
  page?: number
  pageSize?: number
}

export function useServiceSchedules(
  params: ServiceScheduleListParams = {},
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.serviceSchedules.list.queryOptions(params, { enabled })
  )
}

export function useServiceSchedule(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.serviceSchedules.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useServiceSchedulesByServiceObject(
  serviceObjectId: string,
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.serviceSchedules.listByServiceObject.queryOptions(
      { serviceObjectId },
      { enabled: enabled && !!serviceObjectId }
    )
  )
}

export function useServiceSchedulesDashboardSummary(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.serviceSchedules.getDashboardSummary.queryOptions(undefined, {
      enabled,
    })
  )
}

// --- Mutations ---

export function useCreateServiceSchedule() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceSchedules.create.mutationOptions(),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.list.queryKey(),
      })
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.listByServiceObject.queryKey({
          serviceObjectId: variables.serviceObjectId,
        }),
      })
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.getDashboardSummary.queryKey(),
      })
    },
  })
}

export function useUpdateServiceSchedule() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceSchedules.update.mutationOptions(),
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.list.queryKey(),
      })
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.getDashboardSummary.queryKey(),
      })
      if (data) {
        qc.invalidateQueries({
          queryKey: trpc.serviceSchedules.getById.queryKey({ id: data.id }),
        })
        qc.invalidateQueries({
          queryKey: trpc.serviceSchedules.listByServiceObject.queryKey({
            serviceObjectId: data.serviceObjectId,
          }),
        })
      }
    },
  })
}

export function useDeleteServiceSchedule() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceSchedules.delete.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.list.queryKey(),
      })
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.listByServiceObject.queryKey(),
      })
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.getDashboardSummary.queryKey(),
      })
    },
  })
}

export function useGenerateOrderFromSchedule() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.serviceSchedules.generateOrder.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.list.queryKey(),
      })
      qc.invalidateQueries({
        queryKey: trpc.serviceSchedules.listByServiceObject.queryKey(),
      })
      qc.invalidateQueries({
        queryKey: trpc.orders.list.queryKey(),
      })
    },
  })
}

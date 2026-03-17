import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Task Hooks ====================

interface UseCrmTasksOptions {
  enabled?: boolean
  addressId?: string
  inquiryId?: string
  assigneeId?: string
  status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  type?: "TASK" | "MESSAGE"
  search?: string
  page?: number
  pageSize?: number
}

export function useCrmTasks(options: UseCrmTasksOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.tasks.list.queryOptions(
      {
        addressId: input.addressId,
        inquiryId: input.inquiryId,
        assigneeId: input.assigneeId,
        status: input.status,
        type: input.type,
        search: input.search,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

interface UseMyTasksOptions {
  enabled?: boolean
  status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  type?: "TASK" | "MESSAGE"
  page?: number
  pageSize?: number
}

export function useMyTasks(options: UseMyTasksOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.tasks.myTasks.queryOptions(
      {
        status: input.status,
        type: input.type,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useCrmTaskById(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.tasks.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateCrmTask() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.tasks.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.myTasks.queryKey(),
      })
    },
  })
}

export function useUpdateCrmTask() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.tasks.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.myTasks.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.getById.queryKey(),
      })
    },
  })
}

export function useCompleteCrmTask() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.tasks.complete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.myTasks.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.getById.queryKey(),
      })
    },
  })
}

export function useCancelCrmTask() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.tasks.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.myTasks.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.getById.queryKey(),
      })
    },
  })
}

export function useReopenCrmTask() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.tasks.reopen.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.myTasks.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.getById.queryKey(),
      })
    },
  })
}

export function useMarkCrmTaskRead() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.tasks.markRead.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.myTasks.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.getById.queryKey(),
      })
    },
  })
}

export function useDeleteCrmTask() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.tasks.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.tasks.myTasks.queryKey(),
      })
    },
  })
}

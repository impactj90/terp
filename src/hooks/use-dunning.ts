import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Dunning (Mahnwesen) Hooks ====================

export function useDunningProposal() {
  const trpc = useTRPC()
  return useQuery(trpc.billing.reminders.getEligibleProposal.queryOptions())
}

export function useDunningSettings() {
  const trpc = useTRPC()
  return useQuery(trpc.billing.reminders.getSettings.queryOptions())
}

export function useUpdateDunningSettings() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.updateSettings.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getSettings.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listTemplates.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getEligibleProposal.queryKey(),
      })
    },
  })
}

export function useDunningTemplates() {
  const trpc = useTRPC()
  return useQuery(trpc.billing.reminders.listTemplates.queryOptions())
}

export function useDunningTemplate(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.reminders.getTemplate.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateDunningTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.createTemplate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listTemplates.queryKey(),
      })
    },
  })
}

export function useUpdateDunningTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.updateTemplate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listTemplates.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getTemplate.queryKey(),
      })
    },
  })
}

export function useDeleteDunningTemplate() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.deleteTemplate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listTemplates.queryKey(),
      })
    },
  })
}

export function useSeedDefaultDunningTemplates() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.seedDefaultTemplates.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listTemplates.queryKey(),
      })
    },
  })
}

export function useCreateDunningRun() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.createRun.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getEligibleProposal.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listRuns.queryKey(),
      })
    },
  })
}

type DunningRunStatusFilter = "DRAFT" | "SENT" | "CANCELLED" | "ALL"

export function useDunningRuns(status: DunningRunStatusFilter = "ALL") {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.reminders.listRuns.queryOptions({ status })
  )
}

export function useDunningRun(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.reminders.getRun.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useSendDunningReminder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.send.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listRuns.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getRun.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getEligibleProposal.queryKey(),
      })
    },
  })
}

export function useMarkDunningReminderSent() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.markSentManually.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listRuns.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getRun.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getEligibleProposal.queryKey(),
      })
    },
  })
}

export function useCancelDunningReminder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.listRuns.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getRun.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getEligibleProposal.queryKey(),
      })
    },
  })
}

export function useDunningPdfDownloadUrl() {
  const trpc = useTRPC()
  return useMutation(trpc.billing.reminders.getPdfDownloadUrl.mutationOptions())
}

export function useDunningPdfPreview() {
  const trpc = useTRPC()
  return useMutation(trpc.billing.reminders.generatePdfPreview.mutationOptions())
}

export function useSetCustomerDunningBlock() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.setCustomerBlock.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getEligibleProposal.queryKey(),
      })
      // Re-fetch the address detail + list so the widget's `initialBlocked`
      // prop reflects the new state; without this the form's useEffect
      // resets the checkbox back to the stale `false` value and the user
      // cannot toggle the block off again.
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
    },
  })
}

export function useSetInvoiceDunningBlock() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.reminders.setInvoiceBlock.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.reminders.getEligibleProposal.queryKey(),
      })
      // See note on useSetCustomerDunningBlock: the document detail query
      // must refresh so DunningBlockCard sees the new `initialBlocked` and
      // can be toggled off again.
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
    },
  })
}

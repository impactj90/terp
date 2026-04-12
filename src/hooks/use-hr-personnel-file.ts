/**
 * HR Personnel File Hooks
 *
 * React hooks wrapping tRPC queries/mutations for personnel file
 * categories, entries, attachments, reminders, and expiring entries.
 */
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// =============================================================================
// Category Hooks
// =============================================================================

export function useHrPersonnelFileCategories() {
  const trpc = useTRPC()
  return useQuery(trpc.hr.personnelFile.categories.list.queryOptions())
}

export function useCreateHrPersonnelFileCategory() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.categories.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.categories.list.queryKey() })
    },
  })
}

export function useUpdateHrPersonnelFileCategory() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.categories.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.categories.list.queryKey() })
    },
  })
}

export function useDeleteHrPersonnelFileCategory() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.categories.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.categories.list.queryKey() })
    },
  })
}

// =============================================================================
// Entry Hooks
// =============================================================================

export function useHrPersonnelFileEntries(employeeId: string, categoryId?: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.hr.personnelFile.entries.list.queryOptions(
      { employeeId, categoryId },
      { enabled: !!employeeId }
    )
  )
}

export function useHrPersonnelFileEntry(id: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.hr.personnelFile.entries.getById.queryOptions(
      { id },
      { enabled: !!id }
    )
  )
}

export function useCreateHrPersonnelFileEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.entries.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.list.queryKey() })
    },
  })
}

export function useUpdateHrPersonnelFileEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.entries.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.getById.queryKey() })
    },
  })
}

export function useDeleteHrPersonnelFileEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.entries.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.list.queryKey() })
    },
  })
}

// =============================================================================
// Reminder & Expiry Hooks
// =============================================================================

export function useHrPersonnelFileReminders(dateRange?: { from?: Date; to?: Date }) {
  const trpc = useTRPC()
  return useQuery(
    trpc.hr.personnelFile.entries.getReminders.queryOptions(dateRange ?? {})
  )
}

export function useHrPersonnelFileExpiring(withinDays = 30) {
  const trpc = useTRPC()
  return useQuery(
    trpc.hr.personnelFile.entries.getExpiring.queryOptions({ withinDays })
  )
}

// =============================================================================
// Attachment Hooks
// =============================================================================

export function useUploadHrPersonnelFileAttachment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const getUploadUrl = useMutation({
    ...trpc.hr.personnelFile.attachments.getUploadUrl.mutationOptions(),
  })

  const confirmUpload = useMutation({
    ...trpc.hr.personnelFile.attachments.confirm.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.getById.queryKey() })
    },
  })

  return { getUploadUrl, confirmUpload }
}

export function useDeleteHrPersonnelFileAttachment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.hr.personnelFile.attachments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.hr.personnelFile.entries.getById.queryKey() })
    },
  })
}

export function useHrPersonnelFileDownloadUrl(id: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.hr.personnelFile.attachments.getDownloadUrl.queryOptions(
      { id },
      { enabled: !!id }
    )
  )
}

"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  useServiceSchedulesByServiceObject,
  useDeleteServiceSchedule,
} from "@/hooks/use-service-schedules"
import {
  ScheduleListTable,
  type ScheduleRow,
} from "./schedule-list-table"
import {
  ScheduleFormSheet,
  type ExistingSchedule,
} from "./schedule-form-sheet"
import { GenerateOrderDialog } from "./generate-order-dialog"

interface Props {
  serviceObjectId: string
}

export function ServiceObjectScheduleTab({ serviceObjectId }: Props) {
  const t = useTranslations("serviceSchedules")

  const { data, isLoading } =
    useServiceSchedulesByServiceObject(serviceObjectId)
  const deleteMutation = useDeleteServiceSchedule()

  const [createOpen, setCreateOpen] = React.useState(false)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [generateId, setGenerateId] = React.useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null
  )

  const schedules = (data ?? []) as unknown as ScheduleRow[]
  const editing = editId
    ? ((data ?? []).find((s) => s.id === editId) as
        | (ExistingSchedule & { id: string })
        | undefined)
    : undefined

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return
    try {
      await deleteMutation.mutateAsync({ id: confirmDeleteId })
      toast.success(t("deleteSuccess"))
      setConfirmDeleteId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteError"))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("titleForServiceObject")}</h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t("newSchedule")}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : schedules.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("empty.serviceObject")}
          </p>
        </div>
      ) : (
        <ScheduleListTable
          schedules={schedules}
          showServiceObjectColumn={false}
          onEdit={(id) => setEditId(id)}
          onDelete={(id) => setConfirmDeleteId(id)}
          onGenerateOrder={(id) => setGenerateId(id)}
        />
      )}

      <ScheduleFormSheet
        open={createOpen || !!editId}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false)
            setEditId(null)
          }
        }}
        existing={editing ?? null}
        defaultServiceObjectId={serviceObjectId}
      />

      {generateId && (
        <GenerateOrderDialog
          scheduleId={generateId}
          open={!!generateId}
          onOpenChange={(o) => {
            if (!o) setGenerateId(null)
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteId(null)
        }}
        title={t("deleteDialog.title")}
        description={t("deleteDialog.description")}
        confirmLabel={t("deleteDialog.confirm")}
        cancelLabel={t("deleteDialog.cancel")}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}

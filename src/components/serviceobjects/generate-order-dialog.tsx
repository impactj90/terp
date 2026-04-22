"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { AlertTriangle, Loader2, Wrench } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  useServiceSchedule,
  useGenerateOrderFromSchedule,
} from "@/hooks/use-service-schedules"

interface Props {
  scheduleId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GenerateOrderDialog({
  scheduleId,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations("serviceSchedules.generateOrder")
  const router = useRouter()
  const { data: schedule } = useServiceSchedule(scheduleId, open)
  const mutation = useGenerateOrderFromSchedule()
  const [createAssignment, setCreateAssignment] = React.useState(true)

  const employeeName = schedule?.responsibleEmployee
    ? `${schedule.responsibleEmployee.firstName} ${schedule.responsibleEmployee.lastName}`.trim()
    : null

  // Reset assignment checkbox whenever the dialog (re)opens
  React.useEffect(() => {
    if (open) {
      setCreateAssignment(true)
    }
  }, [open, scheduleId])

  async function handleConfirm() {
    try {
      const result = await mutation.mutateAsync({
        id: scheduleId,
        createInitialAssignment: createAssignment && !!employeeName,
      })
      if (!result?.order) {
        toast.error(t("error"))
        return
      }
      toast.success(t("success", { code: result.order.code }))
      onOpenChange(false)
      router.push(`/admin/orders/${result.order.id}`)
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? err.message : t("error")
      )
    }
  }

  const handleCancel = () => {
    if (!mutation.isPending) {
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="sm:max-w-md sm:mx-auto sm:rounded-t-lg"
      >
        <SheetHeader className="text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle>{t("dialogTitle")}</SheetTitle>
              <SheetDescription className="mt-1">
                {t("dialogDescription")}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {schedule && (
          <div className="space-y-3 px-1 py-3">
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{schedule.name}</p>
              {schedule.serviceObject && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {schedule.serviceObject.number} — {schedule.serviceObject.name}
                </p>
              )}
            </div>

            {employeeName ? (
              <div className="flex items-start gap-2 rounded-md border p-3">
                <Checkbox
                  id="sched-generate-assignment"
                  checked={createAssignment}
                  onCheckedChange={(v) => setCreateAssignment(v === true)}
                />
                <Label
                  htmlFor="sched-generate-assignment"
                  className="cursor-pointer text-sm"
                >
                  {t("createAssignmentCheckbox", { employeeName })}
                </Label>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                <span>{t("noResponsibleEmployee")}</span>
              </div>
            )}
          </div>
        )}

        <SheetFooter className="flex-row gap-2 sm:gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={mutation.isPending}
            className="flex-1"
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={mutation.isPending || !schedule}
            className="flex-1"
          >
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t("confirmButton")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

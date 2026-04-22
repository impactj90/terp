"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useActivities } from "@/hooks/use-activities"
import { useEmployees } from "@/hooks/use-employees"
import { useServiceObjects } from "@/hooks/use-service-objects"
import {
  useCreateServiceSchedule,
  useUpdateServiceSchedule,
} from "@/hooks/use-service-schedules"

type IntervalType = "TIME_BASED" | "CALENDAR_FIXED"
type IntervalUnit = "DAYS" | "MONTHS" | "YEARS"

export interface ExistingSchedule {
  id: string
  serviceObjectId: string
  name: string
  description?: string | null
  intervalType: IntervalType
  intervalValue: number
  intervalUnit: IntervalUnit
  anchorDate?: string | Date | null
  defaultActivityId?: string | null
  responsibleEmployeeId?: string | null
  estimatedHours?: number | string | null
  leadTimeDays: number
  isActive: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing?: ExistingSchedule | null
  defaultServiceObjectId?: string | null
}

const NONE_VALUE = "__none__"

function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return ""
  if (typeof value === "string") {
    // Either ISO (yyyy-mm-dd...) or already yyyy-mm-dd
    return value.slice(0, 10)
  }
  return value.toISOString().slice(0, 10)
}

export function ScheduleFormSheet({
  open,
  onOpenChange,
  existing,
  defaultServiceObjectId,
}: Props) {
  const t = useTranslations("serviceSchedules")
  const isEdit = !!existing

  const create = useCreateServiceSchedule()
  const update = useUpdateServiceSchedule()

  // --- Form state ---
  const [serviceObjectId, setServiceObjectId] = React.useState("")
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [intervalType, setIntervalType] =
    React.useState<IntervalType>("TIME_BASED")
  const [intervalValue, setIntervalValue] = React.useState("3")
  const [intervalUnit, setIntervalUnit] = React.useState<IntervalUnit>("MONTHS")
  const [anchorDate, setAnchorDate] = React.useState("")
  const [defaultActivityId, setDefaultActivityId] = React.useState("")
  const [responsibleEmployeeId, setResponsibleEmployeeId] = React.useState("")
  const [estimatedHours, setEstimatedHours] = React.useState("")
  const [leadTimeDays, setLeadTimeDays] = React.useState("14")
  const [isActive, setIsActive] = React.useState(true)

  // --- Lookups ---
  const { data: activitiesData } = useActivities({
    isActive: true,
    enabled: open,
  })
  const activities = activitiesData?.data ?? []

  const { data: employeesData } = useEmployees({
    isActive: true,
    pageSize: 200,
    enabled: open,
  })
  const employees = employeesData?.items ?? []

  const { data: serviceObjectsData } = useServiceObjects(
    { isActive: true, pageSize: 200 },
    open && !defaultServiceObjectId && !isEdit
  )
  const serviceObjects = (serviceObjectsData?.items ?? []) as Array<{
    id: string
    number: string
    name: string
  }>

  // --- Reset on open ---
  React.useEffect(() => {
    if (!open) return
    if (existing) {
      setServiceObjectId(existing.serviceObjectId)
      setName(existing.name ?? "")
      setDescription(existing.description ?? "")
      setIntervalType(existing.intervalType)
      setIntervalValue(String(existing.intervalValue ?? 3))
      setIntervalUnit(existing.intervalUnit)
      setAnchorDate(toDateInputValue(existing.anchorDate))
      setDefaultActivityId(existing.defaultActivityId ?? "")
      setResponsibleEmployeeId(existing.responsibleEmployeeId ?? "")
      setEstimatedHours(
        existing.estimatedHours == null ? "" : String(existing.estimatedHours)
      )
      setLeadTimeDays(String(existing.leadTimeDays ?? 14))
      setIsActive(existing.isActive ?? true)
    } else {
      setServiceObjectId(defaultServiceObjectId ?? "")
      setName("")
      setDescription("")
      setIntervalType("TIME_BASED")
      setIntervalValue("3")
      setIntervalUnit("MONTHS")
      setAnchorDate("")
      setDefaultActivityId("")
      setResponsibleEmployeeId("")
      setEstimatedHours("")
      setLeadTimeDays("14")
      setIsActive(true)
    }
  }, [open, existing, defaultServiceObjectId])

  // When switching to TIME_BASED, clear anchor date.
  React.useEffect(() => {
    if (intervalType === "TIME_BASED") {
      setAnchorDate("")
    }
  }, [intervalType])

  const parseIntOrNaN = (s: string): number => {
    const n = Number.parseInt(s, 10)
    return Number.isFinite(n) ? n : NaN
  }

  const isSubmitting = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error(t("form.errorMissingName"))
      return
    }
    if (!isEdit && !serviceObjectId) {
      toast.error(t("form.errorMissingServiceObject"))
      return
    }

    const intervalValueNum = parseIntOrNaN(intervalValue)
    if (!Number.isInteger(intervalValueNum) || intervalValueNum < 1) {
      toast.error(t("form.errorIntervalValue"))
      return
    }

    const leadTimeDaysNum = parseIntOrNaN(leadTimeDays)
    if (!Number.isInteger(leadTimeDaysNum) || leadTimeDaysNum < 0) {
      toast.error(t("form.errorLeadTimeDays"))
      return
    }

    if (intervalType === "CALENDAR_FIXED" && !anchorDate) {
      toast.error(t("form.errorAnchorDateRequired"))
      return
    }

    const estimatedHoursNum = estimatedHours.trim()
      ? Number.parseFloat(estimatedHours)
      : null
    if (estimatedHoursNum !== null && Number.isNaN(estimatedHoursNum)) {
      toast.error(t("form.errorEstimatedHours"))
      return
    }

    try {
      if (isEdit && existing) {
        await update.mutateAsync({
          id: existing.id,
          name: name.trim(),
          description: description.trim() || null,
          intervalType,
          intervalValue: intervalValueNum,
          intervalUnit,
          anchorDate:
            intervalType === "CALENDAR_FIXED" ? anchorDate : null,
          defaultActivityId: defaultActivityId || null,
          responsibleEmployeeId: responsibleEmployeeId || null,
          estimatedHours: estimatedHoursNum,
          leadTimeDays: leadTimeDaysNum,
          isActive,
        })
        toast.success(t("form.successUpdated"))
      } else {
        await create.mutateAsync({
          serviceObjectId,
          name: name.trim(),
          description: description.trim() || null,
          intervalType,
          intervalValue: intervalValueNum,
          intervalUnit,
          anchorDate:
            intervalType === "CALENDAR_FIXED" ? anchorDate : null,
          defaultActivityId: defaultActivityId || null,
          responsibleEmployeeId: responsibleEmployeeId || null,
          estimatedHours: estimatedHoursNum,
          leadTimeDays: leadTimeDaysNum,
          isActive,
        })
        toast.success(t("form.successCreated"))
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("form.error"))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? t("form.titleEdit") : t("form.titleCreate")}
          </SheetTitle>
          <SheetDescription>{t("form.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <form
            id="schedule-form"
            onSubmit={handleSubmit}
            className="space-y-4 py-4"
          >
            {/* Service Object (only when creating from global list) */}
            {!isEdit && !defaultServiceObjectId && (
              <div className="space-y-1">
                <Label htmlFor="sched-so">
                  {t("form.serviceObject")} *
                </Label>
                <Select
                  value={serviceObjectId}
                  onValueChange={setServiceObjectId}
                >
                  <SelectTrigger id="sched-so">
                    <SelectValue
                      placeholder={t("form.serviceObjectPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceObjects.map((so) => (
                      <SelectItem key={so.id} value={so.id}>
                        {so.number} — {so.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Name */}
            <div className="space-y-1">
              <Label htmlFor="sched-name">{t("form.name")} *</Label>
              <Input
                id="sched-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label htmlFor="sched-desc">{t("form.description")}</Label>
              <Textarea
                id="sched-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={5000}
              />
            </div>

            {/* Interval Type */}
            <div className="space-y-1">
              <Label htmlFor="sched-interval-type">
                {t("form.intervalType")} *
              </Label>
              <Select
                value={intervalType}
                onValueChange={(v) => setIntervalType(v as IntervalType)}
              >
                <SelectTrigger id="sched-interval-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TIME_BASED">
                    {t("intervalType.TIME_BASED")}
                  </SelectItem>
                  <SelectItem value="CALENDAR_FIXED">
                    {t("intervalType.CALENDAR_FIXED")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("form.intervalTypeHelp")}
              </p>
            </div>

            {/* Interval Value + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sched-interval-value">
                  {t("form.intervalValue")} *
                </Label>
                <Input
                  id="sched-interval-value"
                  type="number"
                  min={1}
                  max={365}
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sched-interval-unit">
                  {t("form.intervalUnit")} *
                </Label>
                <Select
                  value={intervalUnit}
                  onValueChange={(v) => setIntervalUnit(v as IntervalUnit)}
                >
                  <SelectTrigger id="sched-interval-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAYS">
                      {t("intervalUnit.DAYS")}
                    </SelectItem>
                    <SelectItem value="MONTHS">
                      {t("intervalUnit.MONTHS")}
                    </SelectItem>
                    <SelectItem value="YEARS">
                      {t("intervalUnit.YEARS")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Anchor Date — only for CALENDAR_FIXED */}
            {intervalType === "CALENDAR_FIXED" && (
              <div className="space-y-1">
                <Label htmlFor="sched-anchor">{t("form.anchorDate")} *</Label>
                <Input
                  id="sched-anchor"
                  type="date"
                  value={anchorDate}
                  onChange={(e) => setAnchorDate(e.target.value)}
                  required
                />
              </div>
            )}

            {/* Default Activity */}
            <div className="space-y-1">
              <Label htmlFor="sched-activity">
                {t("form.defaultActivity")}
              </Label>
              <Select
                value={defaultActivityId || NONE_VALUE}
                onValueChange={(v) =>
                  setDefaultActivityId(v === NONE_VALUE ? "" : v)
                }
              >
                <SelectTrigger id="sched-activity">
                  <SelectValue
                    placeholder={t("form.defaultActivityPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>
                    {t("form.noActivity")}
                  </SelectItem>
                  {activities.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Responsible Employee */}
            <div className="space-y-1">
              <Label htmlFor="sched-employee">
                {t("form.responsibleEmployee")}
              </Label>
              <Select
                value={responsibleEmployeeId || NONE_VALUE}
                onValueChange={(v) =>
                  setResponsibleEmployeeId(v === NONE_VALUE ? "" : v)
                }
              >
                <SelectTrigger id="sched-employee">
                  <SelectValue
                    placeholder={t("form.responsibleEmployeePlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>
                    {t("form.noEmployee")}
                  </SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estimated Hours + Lead Time Days */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sched-hours">
                  {t("form.estimatedHours")}
                </Label>
                <Input
                  id="sched-hours"
                  type="number"
                  min={0}
                  step={0.25}
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sched-lead">
                  {t("form.leadTimeDays")} *
                </Label>
                <Input
                  id="sched-lead"
                  type="number"
                  min={0}
                  max={365}
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t("form.leadTimeDaysHelp")}
                </p>
              </div>
            </div>

            {/* Active */}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="sched-active" className="cursor-pointer">
                  {t("form.isActive")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("form.isActiveHelp")}
                </p>
              </div>
              <Switch
                id="sched-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </form>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 sm:gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            {t("form.cancel")}
          </Button>
          <Button
            type="submit"
            form="schedule-form"
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t("form.saveButton") : t("form.createButton")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

"use client"

import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"

export type ScheduleStatus = "overdue" | "due_soon" | "ok" | "inactive"

const VARIANT_MAP: Record<
  ScheduleStatus,
  "red" | "yellow" | "green" | "gray"
> = {
  overdue: "red",
  due_soon: "yellow",
  ok: "green",
  inactive: "gray",
}

interface Props {
  status: ScheduleStatus
}

export function ScheduleStatusBadge({ status }: Props) {
  const t = useTranslations("serviceSchedules.status")
  const label =
    status === "overdue"
      ? t("overdue")
      : status === "due_soon"
        ? t("dueSoon")
        : status === "ok"
          ? t("ok")
          : t("inactive")
  return <Badge variant={VARIANT_MAP[status]}>{label}</Badge>
}

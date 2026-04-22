"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { MoreHorizontal, Wrench } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ScheduleStatusBadge,
  type ScheduleStatus,
} from "./schedule-status-badge"

// Minimal shape required by the table — matches ServiceScheduleDto on
// the wire (serialized Date → string).
export interface ScheduleRow {
  id: string
  name: string
  intervalType: "TIME_BASED" | "CALENDAR_FIXED"
  intervalValue: number
  intervalUnit: "DAYS" | "MONTHS" | "YEARS"
  nextDueAt: string | Date | null
  status: ScheduleStatus
  serviceObject?: {
    id: string
    number: string
    name: string
  } | null
}

interface Props {
  schedules: ScheduleRow[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onGenerateOrder: (id: string) => void
  /** true for global list, false for service-object detail tab */
  showServiceObjectColumn?: boolean
  isLoading?: boolean
}

function formatDate(date: string | Date | null | undefined): string | null {
  if (!date) return null
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("de-DE").format(d)
}

export function ScheduleListTable({
  schedules,
  onEdit,
  onDelete,
  onGenerateOrder,
  showServiceObjectColumn = false,
  isLoading = false,
}: Props) {
  const t = useTranslations("serviceSchedules")

  const columnCount = showServiceObjectColumn ? 6 : 5

  return (
    <>
      {/* Mobile: Card list */}
      <div className="divide-y border rounded-md sm:hidden">
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-4">{t("loading")}</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">
            {t("empty.global")}
          </p>
        ) : (
          schedules.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-3 p-3">
              <div className="flex-1 min-w-0">
                {showServiceObjectColumn && s.serviceObject && (
                  <p className="text-xs text-muted-foreground truncate">
                    {s.serviceObject.number} — {s.serviceObject.name}
                  </p>
                )}
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(`intervalType.${s.intervalType}`)} · {s.intervalValue}{" "}
                  {t(`intervalUnit.${s.intervalUnit}`)}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <ScheduleStatusBadge status={s.status} />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(s.nextDueAt) ?? t("lastCompleted.never")}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onGenerateOrder(s.id)}
                  disabled={s.status === "inactive"}
                >
                  <Wrench className="h-4 w-4 mr-1" />
                  {t("generateOrder.button")}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(s.id)}>
                      {t("actions.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(s.id)}
                      variant="destructive"
                    >
                      {t("actions.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop: Table */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              {showServiceObjectColumn && (
                <TableHead>{t("columns.serviceObject")}</TableHead>
              )}
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.intervalType")}</TableHead>
              <TableHead>{t("columns.nextDueAt")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="text-right">
                {t("columns.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="text-center text-muted-foreground"
                >
                  {t("loading")}
                </TableCell>
              </TableRow>
            ) : schedules.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="text-center text-muted-foreground"
                >
                  {t("empty.global")}
                </TableCell>
              </TableRow>
            ) : (
              schedules.map((s) => (
                <TableRow key={s.id}>
                  {showServiceObjectColumn && (
                    <TableCell className="text-sm">
                      {s.serviceObject
                        ? `${s.serviceObject.number} — ${s.serviceObject.name}`
                        : "-"}
                    </TableCell>
                  )}
                  <TableCell className="font-medium max-w-[240px] truncate">
                    {s.name}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span>{t(`intervalType.${s.intervalType}`)}</span>
                    <span className="text-muted-foreground ml-1">
                      · {s.intervalValue} {t(`intervalUnit.${s.intervalUnit}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(s.nextDueAt) ?? (
                      <span className="text-muted-foreground">
                        {t("lastCompleted.never")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ScheduleStatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onGenerateOrder(s.id)}
                        disabled={s.status === "inactive"}
                      >
                        <Wrench className="h-4 w-4 mr-1" />
                        {t("generateOrder.button")}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(s.id)}>
                            {t("actions.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDelete(s.id)}
                            variant="destructive"
                          >
                            {t("actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

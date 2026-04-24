/**
 * WorkReports list page — `/admin/work-reports`.
 *
 * Paginated table with four status filters (Alle / Entwurf / Signiert /
 * Storniert) rendered as Tabs. The tab value is URL-driven via
 * `?status=...` so a hard reload preserves the active filter.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 8)
 */
"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Stamp } from "lucide-react"
import { useAuth } from "@/providers/auth-provider"

import { useHasPermission } from "@/hooks"
import { useWorkReports } from "@/hooks/use-work-reports"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pagination } from "@/components/ui/pagination"
import { WorkReportStatusBadge } from "@/components/work-reports/work-report-status-badge"

type StatusFilter = "ALL" | "DRAFT" | "SIGNED" | "VOID"

const TAB_VALUES: StatusFilter[] = ["ALL", "DRAFT", "SIGNED", "VOID"]

const PAGE_SIZE = 50

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}.${m}.${y}`
}

function parseStatus(raw: string | null): StatusFilter {
  if (raw && TAB_VALUES.includes(raw as StatusFilter)) return raw as StatusFilter
  return "ALL"
}

export default function WorkReportsListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission([
    "work_reports.view",
    "work_reports.manage",
  ])
  const { allowed: canManage } = useHasPermission(["work_reports.manage"])

  const statusFilter = parseStatus(searchParams?.get("status") ?? null)
  const page = Math.max(
    1,
    parseInt(searchParams?.get("page") ?? "1", 10) || 1,
  )
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useWorkReports(
    {
      status: statusFilter === "ALL" ? undefined : statusFilter,
      limit: PAGE_SIZE,
      offset,
    },
    !authLoading && !permLoading && canAccess,
  )

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push("/dashboard")
    }
  }, [authLoading, permLoading, canAccess, router])

  function setStatus(next: StatusFilter) {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (next === "ALL") params.delete("status")
    else params.set("status", next)
    params.delete("page")
    router.replace(`/admin/work-reports?${params.toString()}`)
  }

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (next <= 1) params.delete("page")
    else params.set("page", String(next))
    router.replace(`/admin/work-reports?${params.toString()}`)
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0

  if (authLoading || permLoading) return <PageSkeleton />
  if (!canAccess) return null

  return (
    <div className="space-y-6">
      {/* Title + new button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Arbeitsscheine</h1>
          <p className="text-muted-foreground">
            Einsatzprotokolle mit Kundensignatur und archivierter PDF.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => router.push("/admin/work-reports/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Neu
          </Button>
        )}
      </div>

      {/* Status tabs */}
      <Tabs
        value={statusFilter}
        onValueChange={(v) => setStatus(v as StatusFilter)}
      >
        <TabsList>
          <TabsTrigger value="ALL">Alle</TabsTrigger>
          <TabsTrigger value="DRAFT">Entwurf</TabsTrigger>
          <TabsTrigger value="SIGNED">Signiert</TabsTrigger>
          <TabsTrigger value="VOID">Storniert</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="text-sm text-muted-foreground">
        {total === 1 ? "1 Arbeitsschein" : `${total} Arbeitsscheine`}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : items.length === 0 ? (
            <WorkReportsEmptyState
              filterActive={statusFilter !== "ALL"}
              canCreate={canManage}
              onCreate={() => router.push("/admin/work-reports/new")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr.</TableHead>
                  <TableHead>Einsatzdatum</TableHead>
                  <TableHead>Auftrag</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Serviceobjekt</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      router.push(`/admin/work-reports/${r.id}`)
                    }
                  >
                    <TableCell className="font-mono font-medium">
                      {r.code}
                    </TableCell>
                    <TableCell>{formatDate(r.visitDate)}</TableCell>
                    <TableCell>
                      {r.order ? (
                        <>
                          <span className="font-mono text-xs text-muted-foreground">
                            {r.order.code}
                          </span>{" "}
                          {r.order.name}
                        </>
                      ) : (
                        "–"
                      )}
                    </TableCell>
                    <TableCell>{r.order?.customer ?? "–"}</TableCell>
                    <TableCell>
                      {r.serviceObject ? (
                        <>
                          <span className="font-mono text-xs text-muted-foreground">
                            {r.serviceObject.number}
                          </span>{" "}
                          {r.serviceObject.name}
                        </>
                      ) : (
                        "–"
                      )}
                    </TableCell>
                    <TableCell>
                      <WorkReportStatusBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          limit={PAGE_SIZE}
          onPageChange={setPage}
          onLimitChange={() => {
            /* page size is fixed */
          }}
        />
      )}
    </div>
  )
}

function WorkReportsEmptyState({
  filterActive,
  canCreate,
  onCreate,
}: {
  filterActive: boolean
  canCreate: boolean
  onCreate: () => void
}) {
  return (
    <div className="px-6 py-12 text-center">
      <Stamp className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mt-4 text-lg font-medium">Noch keine Arbeitsscheine</h3>
      <p className="text-sm text-muted-foreground">
        {filterActive
          ? "In der gewählten Status-Ansicht sind keine Arbeitsscheine vorhanden."
          : "Legen Sie den ersten Arbeitsschein an, um den Einsatz vor Ort zu dokumentieren."}
      </p>
      {!filterActive && canCreate && (
        <Button className="mt-4" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Neuer Arbeitsschein
        </Button>
      )}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-[400px]" />
    </div>
  )
}

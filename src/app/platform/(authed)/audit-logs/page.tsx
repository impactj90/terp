"use client"

/**
 * Platform audit log viewer.
 *
 * Filters: action, target tenant id. Paginated, 20 per page. The detail
 * sheet renders `changes` as a simple JSON diff table (purpose-built here
 * rather than importing `src/components/audit-logs/audit-log-json-diff.tsx`
 * because that component pulls in `next-intl`, which is not available on
 * the platform tree).
 */
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { usePlatformTRPC } from "@/trpc/platform/context"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type AuditEntry = {
  id: string
  action: string
  platformUserId: string | null
  targetTenantId: string | null
  entityType: string | null
  entityId: string | null
  supportSessionId: string | null
  changes: unknown
  metadata: unknown
  ipAddress: string | null
  userAgent: string | null
  performedAt: string | Date
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "medium",
  })
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-sm text-muted-foreground">—</p>
  }
  return (
    <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export default function PlatformAuditLogsPage() {
  const trpc = usePlatformTRPC()
  const [actionFilter, setActionFilter] = useState("")
  const [tenantFilter, setTenantFilter] = useState("")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AuditEntry | null>(null)

  const pageSize = 20
  const listQuery = useQuery(
    trpc.auditLogs.list.queryOptions({
      page,
      pageSize,
      action: actionFilter.trim() || undefined,
      targetTenantId: tenantFilter.trim() || undefined,
    })
  )

  const data = listQuery.data as
    | { items: AuditEntry[]; total: number }
    | undefined
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const items: AuditEntry[] = data?.items ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit-Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unveränderliche Historie aller Plattform-Aktionen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>
            Filter werden serverseitig angewendet.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Aktion
            </label>
            <Input
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value)
                setPage(1)
              }}
              placeholder="z. B. support_session.activated"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Target-Tenant (UUID)
            </label>
            <Input
              value={tenantFilter}
              onChange={(e) => {
                setTenantFilter(e.target.value)
                setPage(1)
              }}
              placeholder="UUID"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => {
                setActionFilter("")
                setTenantFilter("")
                setPage(1)
              }}
              disabled={!actionFilter && !tenantFilter}
            >
              Zurücksetzen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Ereignisse{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({total})
            </span>
          </CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || listQuery.isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Zurück
            </Button>
            <span className="text-xs text-muted-foreground">
              Seite {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || listQuery.isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Weiter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Einträge gefunden.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeit</TableHead>
                  <TableHead>Aktion</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Target-Tenant</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(entry.performedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.platformUserId
                        ? `${entry.platformUserId.slice(0, 8)}…`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.targetTenantId
                        ? `${entry.targetTenantId.slice(0, 8)}…`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.ipAddress ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelected(entry)}
                      >
                        Öffnen
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Audit-Eintrag</SheetTitle>
            <SheetDescription>
              Nur-Lese-Ansicht des vollständigen Eintrags.
            </SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <span className="text-muted-foreground">Zeit</span>
                <span>{formatDateTime(selected.performedAt)}</span>
                <span className="text-muted-foreground">Aktion</span>
                <span className="font-mono">{selected.action}</span>
                <span className="text-muted-foreground">Operator</span>
                <span className="font-mono text-xs">
                  {selected.platformUserId ?? "—"}
                </span>
                <span className="text-muted-foreground">Target-Tenant</span>
                <span className="font-mono text-xs">
                  {selected.targetTenantId ?? "—"}
                </span>
                <span className="text-muted-foreground">Entity</span>
                <span className="font-mono text-xs">
                  {selected.entityType
                    ? `${selected.entityType}:${selected.entityId ?? "—"}`
                    : "—"}
                </span>
                <span className="text-muted-foreground">Support-Session</span>
                <span className="font-mono text-xs">
                  {selected.supportSessionId ?? "—"}
                </span>
                <span className="text-muted-foreground">IP</span>
                <span>{selected.ipAddress ?? "—"}</span>
                <span className="text-muted-foreground">User-Agent</span>
                <span className="break-all text-xs">
                  {selected.userAgent ?? "—"}
                </span>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  Changes
                </div>
                <JsonBlock value={selected.changes} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  Metadata
                </div>
                <JsonBlock value={selected.metadata} />
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

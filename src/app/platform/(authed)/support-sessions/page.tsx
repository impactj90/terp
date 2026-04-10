"use client"

/**
 * Platform support sessions — tabbed list view.
 *
 * Tabs: pending · active · expired/revoked. Operators can "Beitreten" on
 * a pending row, which calls `supportSessions.activate`. The actual
 * impersonation mechanic — switching the UI into the tenant context —
 * lands in Phase 7. For now "Beitreten" activates the session and the
 * list is refetched.
 */
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { LogIn, Ban } from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

type StatusFilter = "pending" | "active" | "closed"

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">Offen</Badge>
    case "active":
      return <Badge>Aktiv</Badge>
    case "revoked":
      return <Badge variant="outline">Widerrufen</Badge>
    case "expired":
      return <Badge variant="outline">Abgelaufen</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function PlatformSupportSessionsPage() {
  const trpc = usePlatformTRPC()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<StatusFilter>("pending")

  // "closed" is a UI grouping over revoked+expired. The server exposes
  // them as distinct statuses so we fetch both and merge for that tab.
  const pendingQuery = useQuery({
    ...trpc.supportSessions.list.queryOptions({ status: "pending" }),
    enabled: tab === "pending",
  })
  const activeQuery = useQuery({
    ...trpc.supportSessions.list.queryOptions({ status: "active" }),
    enabled: tab === "active",
  })
  const revokedQuery = useQuery({
    ...trpc.supportSessions.list.queryOptions({ status: "revoked" }),
    enabled: tab === "closed",
  })
  const expiredQuery = useQuery({
    ...trpc.supportSessions.list.queryOptions({ status: "expired" }),
    enabled: tab === "closed",
  })

  const activate = useMutation({
    ...trpc.supportSessions.activate.mutationOptions(),
    onSuccess: () => {
      toast.success("Support-Session aktiviert")
      queryClient.invalidateQueries({
        queryKey: trpc.supportSessions.list.queryKey(),
      })
    },
    onError: (err) => toast.error(err.message ?? "Aktivierung fehlgeschlagen"),
  })

  const revoke = useMutation({
    ...trpc.supportSessions.revoke.mutationOptions(),
    onSuccess: () => {
      toast.success("Support-Session widerrufen")
      queryClient.invalidateQueries({
        queryKey: trpc.supportSessions.list.queryKey(),
      })
    },
    onError: (err) => toast.error(err.message ?? "Widerruf fehlgeschlagen"),
  })

  function renderTable(
    rows:
      | Array<{
          id: string
          tenant: { id: string; name: string; slug: string }
          status: string
          reason: string
          createdAt: string | Date
          expiresAt: string | Date
          activatedAt: string | Date | null
        }>
      | undefined,
    isLoading: boolean,
    emptyMsg: string
  ) {
    if (isLoading) {
      return (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )
    }
    if (!rows || rows.length === 0) {
      return <p className="text-sm text-muted-foreground">{emptyMsg}</p>
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tenant</TableHead>
            <TableHead>Grund</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Erstellt</TableHead>
            <TableHead>Läuft ab</TableHead>
            <TableHead className="text-right">Aktion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.tenant.name}</TableCell>
              <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground">
                {r.reason}
              </TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(r.createdAt)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(r.expiresAt)}
              </TableCell>
              <TableCell className="text-right">
                {r.status === "pending" ? (
                  <Button
                    size="sm"
                    disabled={activate.isPending}
                    onClick={() => activate.mutate({ id: r.id })}
                  >
                    <LogIn className="mr-1 size-3" />
                    Beitreten
                  </Button>
                ) : r.status === "active" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate({ id: r.id })}
                  >
                    <Ban className="mr-1 size-3" />
                    Widerrufen
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  const closedRows = [
    ...(revokedQuery.data ?? []),
    ...(expiredQuery.data ?? []),
  ].sort((a, b) => {
    const ad = new Date(a.createdAt).getTime()
    const bd = new Date(b.createdAt).getTime()
    return bd - ad
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Support-Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Support-Anfragen von Tenants — aktivieren, bearbeiten, abschließen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="pending">Offen</TabsTrigger>
              <TabsTrigger value="active">Aktiv</TabsTrigger>
              <TabsTrigger value="closed">
                Abgelaufen / Widerrufen
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4">
              {renderTable(
                pendingQuery.data,
                pendingQuery.isLoading,
                "Keine offenen Anfragen."
              )}
            </TabsContent>
            <TabsContent value="active" className="mt-4">
              {renderTable(
                activeQuery.data,
                activeQuery.isLoading,
                "Keine aktiven Sessions."
              )}
            </TabsContent>
            <TabsContent value="closed" className="mt-4">
              {renderTable(
                closedRows,
                revokedQuery.isLoading || expiredQuery.isLoading,
                "Keine abgeschlossenen Sessions."
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

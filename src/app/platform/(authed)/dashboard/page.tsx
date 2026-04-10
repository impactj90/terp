"use client"

/**
 * Platform dashboard — at-a-glance view for an operator.
 *
 * Cards:
 *   • Pending support sessions   (server gives all operators visibility)
 *   • Active support sessions    (scoped to this operator)
 *   • Recent audit events        (latest 10 platform audit entries)
 *
 * The demo-convert-request card referenced in the Phase 5 plan is deferred
 * until `demoTenants.requestConvertFromExpired` has a corresponding
 * platform-side materialization (see the "Follow-up" note in the plan).
 */
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  LifeBuoy,
  CheckCircle2,
  ScrollText,
  ExternalLink,
} from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

export default function PlatformDashboardPage() {
  const trpc = usePlatformTRPC()

  const pendingQuery = useQuery(
    trpc.supportSessions.list.queryOptions({ status: "pending" })
  )
  const activeQuery = useQuery(
    trpc.supportSessions.list.queryOptions({ status: "active" })
  )
  const auditQuery = useQuery(
    trpc.auditLogs.list.queryOptions({ page: 1, pageSize: 10 })
  )

  const pendingCount = pendingQuery.data?.length ?? 0
  const activeCount = activeQuery.data?.length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Überblick über laufende Support-Sessions und Audit-Ereignisse.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Offene Anfragen
            </CardTitle>
            <LifeBuoy className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {pendingQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{pendingCount}</div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Ausstehende Support-Anfragen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Aktive Sessions
            </CardTitle>
            <CheckCircle2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {activeQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{activeCount}</div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Laufende Sessions Ihrer Sitzung
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Audit-Events</CardTitle>
            <ScrollText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {auditQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {auditQuery.data?.total ?? 0}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Gesamt im Audit-Log
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Two-column: pending sessions + recent audit */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Offene Support-Anfragen</CardTitle>
              <CardDescription>
                Von Tenants initiiert — warten auf Beitritt.
              </CardDescription>
            </div>
            <Link
              href="/platform/support-sessions"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Alle anzeigen
            </Link>
          </CardHeader>
          <CardContent>
            {pendingQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : pendingCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine offenen Anfragen.
              </p>
            ) : (
              <ul className="divide-y">
                {pendingQuery.data!.slice(0, 5).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{s.tenant.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(s.createdAt)}
                      </div>
                    </div>
                    <Link
                      href="/platform/support-sessions"
                      className="text-xs text-primary hover:underline"
                    >
                      Öffnen
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Letzte Audit-Ereignisse</CardTitle>
              <CardDescription>
                Chronologisch, neueste zuerst.
              </CardDescription>
            </div>
            <Link
              href="/platform/audit-logs"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Audit-Log
              <ExternalLink className="ml-1 inline size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {auditQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Einträge vorhanden.
              </p>
            ) : (
              <ul className="divide-y">
                {(auditQuery.data!.items as unknown as Array<{ id: string; action: string; targetTenantId: string | null; platformUserId: string | null; performedAt: Date }>).slice(0, 10).map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {entry.action}
                        </Badge>
                        {entry.targetTenantId ? (
                          <span className="truncate text-xs text-muted-foreground">
                            Tenant: {entry.targetTenantId.slice(0, 8)}…
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(entry.performedAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

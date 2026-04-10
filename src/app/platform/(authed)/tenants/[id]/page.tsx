"use client"

/**
 * Platform tenant detail.
 *
 * Shows the metadata an operator can see without an active support
 * session (name, slug, status). Deeper state (users, subscriptions,
 * usage) sits behind `tenants.detail`, which requires an active
 * `SupportSession` — that surfaces in Phase 7 via the impersonation
 * mechanic, so this page links to the support-sessions view to start
 * one.
 */
import { use } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, LifeBuoy } from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default function PlatformTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const trpc = usePlatformTRPC()
  const listQuery = useQuery(
    trpc.tenants.list.queryOptions({ includeInactive: true })
  )
  const tenant = listQuery.data?.find((t) => t.id === id)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/platform/tenants">
            <ArrowLeft className="mr-1 size-4" />
            Zurück
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {listQuery.isLoading ? (
              <Skeleton className="h-7 w-48" />
            ) : tenant ? (
              tenant.name
            ) : (
              "Tenant nicht gefunden"
            )}
          </CardTitle>
          <CardDescription>
            Plattform-seitige Metadaten. Für Tenant-interne Daten ist
            eine Support-Session erforderlich.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {listQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : tenant ? (
            <div className="grid grid-cols-[160px_1fr] gap-2">
              <span className="text-muted-foreground">Name</span>
              <span>{tenant.name}</span>
              <span className="text-muted-foreground">Slug</span>
              <span className="font-mono text-xs">{tenant.slug}</span>
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono text-xs">{tenant.id}</span>
              <span className="text-muted-foreground">Status</span>
              <span>
                {tenant.isActive ? (
                  <Badge variant="secondary">Aktiv</Badge>
                ) : (
                  <Badge variant="outline">Inaktiv</Badge>
                )}
              </span>
              <span className="text-muted-foreground">Angelegt</span>
              <span>{formatDateTime(tenant.createdAt)}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Support-Session</CardTitle>
          <CardDescription>
            Tenant-Daten (Benutzer, Abrechnungen, Einstellungen) sind nur
            während einer aktiven Support-Session einsehbar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/platform/support-sessions">
              <LifeBuoy className="mr-1 size-4" />
              Zu Support-Sessions
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

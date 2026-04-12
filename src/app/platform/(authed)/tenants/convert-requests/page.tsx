"use client"

/**
 * Platform demo convert-requests inbox.
 *
 * Tabbed view (Pending / Resolved / Dismissed) over `demo_convert_requests`.
 * Row actions:
 *   - Pending: Resolve (note) / Dismiss (note) / "Tenant öffnen →" deep-link
 *     to `/platform/tenants/demo?highlight=<tenantId>`
 *   - Resolved / Dismissed: read-only, shows resolver + note + timestamps
 *
 * Deliberately does NOT perform any convert/extend — the operator uses the
 * deep-link to land on the demo-tenants page and runs those actions from
 * there. Resolve/dismiss here are pure status flips + note persistence.
 */
import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ExternalLink, Loader2 } from "lucide-react"
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
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Tab = "pending" | "resolved" | "dismissed"

type InboxRow = {
  id: string
  tenantId: string
  requestedByUserId: string
  requestedAt: Date | string
  status: string
  resolvedByPlatformUserId: string | null
  resolvedAt: Date | string | null
  resolutionNote: string | null
  tenant: {
    id: string
    name: string
    slug: string
    isDemo: boolean
    demoExpiresAt: Date | string | null
  } | null
  resolvedBy: {
    id: string
    displayName: string
    email: string
  } | null
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })
}

export default function PlatformConvertRequestsPage() {
  const trpc = usePlatformTRPC()
  const qc = useQueryClient()
  const [tab, setTab] = React.useState<Tab>("pending")
  const [resolveTarget, setResolveTarget] = React.useState<InboxRow | null>(
    null,
  )
  const [dismissTarget, setDismissTarget] = React.useState<InboxRow | null>(
    null,
  )

  const listQuery = useQuery(
    trpc.demoConvertRequests.list.queryOptions({
      status: tab,
      page: 1,
      pageSize: 50,
    }),
  )

  const invalidateAll = React.useCallback(() => {
    qc.invalidateQueries({
      queryKey: trpc.demoConvertRequests.list.queryKey(),
    })
    qc.invalidateQueries({
      queryKey: trpc.demoConvertRequests.countPending.queryKey(),
    })
  }, [qc, trpc])

  const resolveMutation = useMutation(
    trpc.demoConvertRequests.resolve.mutationOptions({
      onSuccess: () => {
        toast.success("Anfrage als erledigt markiert")
        invalidateAll()
        setResolveTarget(null)
      },
      onError: (err) =>
        toast.error(err.message ?? "Markieren fehlgeschlagen"),
    }),
  )

  const dismissMutation = useMutation(
    trpc.demoConvertRequests.dismiss.mutationOptions({
      onSuccess: () => {
        toast.success("Anfrage verworfen")
        invalidateAll()
        setDismissTarget(null)
      },
      onError: (err) => toast.error(err.message ?? "Verwerfen fehlgeschlagen"),
    }),
  )

  const items = (listQuery.data?.items ?? []) as InboxRow[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Convert-Anfragen</h1>
        <p className="text-muted-foreground">
          Self-service Convert-Anfragen von Demo-Admins nach Ablauf des
          Demo-Zeitraums.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="pending">Offen</TabsTrigger>
          <TabsTrigger value="resolved">Erledigt</TabsTrigger>
          <TabsTrigger value="dismissed">Verworfen</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Anfragen</CardTitle>
              <CardDescription>
                {tab === "pending"
                  ? "Bearbeite offene Anfragen und verwalte den Demo-Tenant direkt."
                  : tab === "resolved"
                    ? "Als erledigt markierte Anfragen."
                    : "Verworfene Anfragen."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {listQuery.isLoading ? (
                <div className="p-6">
                  <Skeleton className="h-32" />
                </div>
              ) : items.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    Keine Einträge in dieser Ansicht.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Angefragt am</TableHead>
                      <TableHead>Status</TableHead>
                      {tab !== "pending" && <TableHead>Erledigt von</TableHead>}
                      {tab !== "pending" && <TableHead>Notiz</TableHead>}
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">
                            {row.tenant?.name ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.tenant?.slug ?? row.tenantId.slice(0, 8)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDateTime(row.requestedAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        {tab !== "pending" && (
                          <TableCell className="text-sm">
                            {row.resolvedBy?.displayName ?? "—"}
                            {row.resolvedAt ? (
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(row.resolvedAt)}
                              </div>
                            ) : null}
                          </TableCell>
                        )}
                        {tab !== "pending" && (
                          <TableCell className="text-sm max-w-xs truncate">
                            {row.resolutionNote ?? "—"}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {tab === "pending" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                              >
                                <Link
                                  href={`/platform/tenants/demo?highlight=${row.tenantId}`}
                                  prefetch={false}
                                >
                                  <ExternalLink className="mr-1 h-3 w-3" />
                                  Tenant öffnen
                                </Link>
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => setResolveTarget(row)}
                              >
                                Erledigt
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDismissTarget(row)}
                              >
                                Verwerfen
                              </Button>
                            </div>
                          ) : (
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/platform/tenants/demo?highlight=${row.tenantId}`}
                                prefetch={false}
                              >
                                <ExternalLink className="mr-1 h-3 w-3" />
                                Ansehen
                              </Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <NoteDialog
        target={resolveTarget}
        onClose={() => setResolveTarget(null)}
        title="Als erledigt markieren"
        description="Optional eine Notiz hinterlegen (z. B. Referenz zum angelegten Tenant oder Abrechnung)."
        confirmLabel="Als erledigt markieren"
        isPending={resolveMutation.isPending}
        onConfirm={(note) =>
          resolveTarget &&
          resolveMutation.mutate({ id: resolveTarget.id, note })
        }
      />

      <NoteDialog
        target={dismissTarget}
        onClose={() => setDismissTarget(null)}
        title="Anfrage verwerfen"
        description="Optional eine Begründung hinterlegen (z. B. bereits geschlossen, Kontakt verloren)."
        confirmLabel="Verwerfen"
        isPending={dismissMutation.isPending}
        onConfirm={(note) =>
          dismissTarget &&
          dismissMutation.mutate({ id: dismissTarget.id, note })
        }
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">Offen</Badge>
    case "resolved":
      return <Badge>Erledigt</Badge>
    case "dismissed":
      return <Badge variant="outline">Verworfen</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function NoteDialog({
  target,
  onClose,
  title,
  description,
  confirmLabel,
  isPending,
  onConfirm,
}: {
  target: InboxRow | null
  onClose: () => void
  title: string
  description: string
  confirmLabel: string
  isPending: boolean
  onConfirm: (note: string | undefined) => void
}) {
  const [note, setNote] = React.useState("")

  React.useEffect(() => {
    if (!target) setNote("")
  }, [target])

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="note">Notiz</Label>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            Max. 500 Zeichen. Wird im Audit-Log gespeichert.
          </p>
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isPending}
          >
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            onClick={() => onConfirm(note.trim() || undefined)}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

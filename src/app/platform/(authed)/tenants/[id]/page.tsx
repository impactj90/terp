"use client"

/**
 * Platform tenant detail (Phase 9).
 *
 * Three tabs: Übersicht · Einstellungen · Audit-Log.
 * - Übersicht: name, slug, isActive, counts (users, modules, sessions)
 * - Einstellungen: inline edit form calling `tenantManagement.update`
 * - Audit: pre-filtered `platformAuditLogs.list` where targetTenantId=id
 */
import { use, useState, useEffect } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Settings2 } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
  const queryClient = useQueryClient()

  const detailQuery = useQuery(
    trpc.tenantManagement.getById.queryOptions({ id }),
  )
  const auditQuery = useQuery(
    trpc.auditLogs.list.queryOptions({
      targetTenantId: id,
      page: 1,
      pageSize: 50,
    }),
  )

  const tenant = detailQuery.data?.tenant
  const counts = detailQuery.data?.counts

  const [name, setName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [exemptDialogOpen, setExemptDialogOpen] = useState(false)
  const [exemptReason, setExemptReason] = useState("")

  useEffect(() => {
    if (tenant) {
      setName(tenant.name)
      setContactEmail(tenant.email ?? "")
    }
  }, [tenant])

  const updateMutation = useMutation({
    ...trpc.tenantManagement.update.mutationOptions(),
    onSuccess: () => {
      toast.success("Tenant aktualisiert")
      queryClient.invalidateQueries({
        queryKey: trpc.tenantManagement.getById.queryKey({ id }),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.auditLogs.list.queryKey(),
      })
    },
    onError: (err) => toast.error(err.message ?? "Aktualisierung fehlgeschlagen"),
  })

  const setExemptMutation = useMutation({
    ...trpc.tenantManagement.setBillingExempt.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tenantManagement.getById.queryKey({ id }),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.auditLogs.list.queryKey(),
      })
      toast.success("Fakturierungs-Status aktualisiert")
      setExemptDialogOpen(false)
      setExemptReason("")
    },
    onError: (err) => toast.error(err.message ?? "Umschalten fehlgeschlagen"),
  })

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate({
      id,
      name: name.trim(),
      contactEmail: contactEmail.trim(),
    })
  }

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

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {detailQuery.isLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : tenant ? (
              tenant.name
            ) : (
              "Tenant nicht gefunden"
            )}
          </h1>
          {tenant ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {tenant.slug} · {tenant.id}
            </p>
          ) : null}
        </div>
        {tenant ? (
          <Button asChild variant="outline">
            <Link href={`/platform/tenants/${id}/modules`}>
              <Settings2 className="mr-1 size-4" />
              Module verwalten
            </Link>
          </Button>
        ) : null}
      </div>

      {!detailQuery.isLoading && !tenant ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Der angeforderte Tenant existiert nicht.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
            <TabsTrigger value="settings">Einstellungen</TabsTrigger>
            <TabsTrigger value="audit">Audit-Log</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Stammdaten</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm sm:grid-cols-[200px_1fr]">
                {detailQuery.isLoading || !tenant ? (
                  <Skeleton className="h-24 w-full sm:col-span-2" />
                ) : (
                  <>
                    <span className="text-muted-foreground">Name</span>
                    <span>{tenant.name}</span>
                    <span className="text-muted-foreground">Slug</span>
                    <span className="font-mono text-xs">{tenant.slug}</span>
                    <span className="text-muted-foreground">Status</span>
                    <span>
                      {tenant.isActive ? (
                        <Badge variant="secondary">Aktiv</Badge>
                      ) : (
                        <Badge variant="outline">Inaktiv</Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground">Kontakt-E-Mail</span>
                    <span>{tenant.email ?? "—"}</span>
                    <span className="text-muted-foreground">Angelegt</span>
                    <span>{formatDateTime(tenant.createdAt)}</span>
                    <span className="text-muted-foreground">Aktualisiert</span>
                    <span>{formatDateTime(tenant.updatedAt)}</span>
                    {tenant.isDemo ? (
                      <>
                        <span className="text-muted-foreground">Demo</span>
                        <span>
                          <Badge variant="secondary">
                            Demo-Tenant · Ablauf {formatDateTime(tenant.demoExpiresAt)}
                          </Badge>
                        </span>
                      </>
                    ) : null}
                    {tenant.billingExempt ? (
                      <>
                        <span className="text-muted-foreground">Fakturierung</span>
                        <span>
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-700"
                          >
                            Nicht fakturierbar
                          </Badge>
                        </span>
                      </>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kennzahlen</CardTitle>
                <CardDescription>Aktueller Stand.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Benutzer</div>
                  <div className="text-2xl font-bold">
                    {counts?.users ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Aktive Module
                  </div>
                  <div className="text-2xl font-bold">
                    {counts?.enabledModules ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Aktive Support-Sessions
                  </div>
                  <div className="text-2xl font-bold">
                    {counts?.activeSupportSessions ?? "—"}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Einstellungen bearbeiten</CardTitle>
                <CardDescription>
                  Stammdaten des Tenants. Änderungen landen im Platform-Audit-Log.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdate} className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="edit-name">Firmenname</Label>
                    <Input
                      id="edit-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      minLength={2}
                      required
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="edit-email">Kontakt-E-Mail</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2 flex justify-end">
                    <Button type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? "Wird gespeichert…" : "Speichern"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {tenant ? (
              <Card>
                <CardHeader>
                  <CardTitle>Fakturierung</CardTitle>
                  <CardDescription>
                    {tenant.billingExempt
                      ? "Dieser Tenant ist von automatischer Fakturierung ausgenommen. Modul-Buchungen erzeugen keine Abos oder Rechnungen."
                      : "Modul-Buchungen auf diesem Tenant erzeugen automatisch Abos und wiederkehrende Rechnungen im Operator-Tenant."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant={tenant.billingExempt ? "default" : "outline"}
                    onClick={() => setExemptDialogOpen(true)}
                  >
                    {tenant.billingExempt
                      ? "Fakturierung aktivieren"
                      : "Von Fakturierung ausnehmen"}
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Platform-Audit-Log</CardTitle>
                <CardDescription>
                  Alle platform-seitigen Aktionen für diesen Tenant. Maximal 50
                  neueste Einträge.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {auditQuery.isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine Einträge.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Zeitpunkt</TableHead>
                        <TableHead>Aktion</TableHead>
                        <TableHead>Operator</TableHead>
                        <TableHead>Metadaten</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(auditQuery.data!.items as unknown as Array<{ id: string; performedAt: Date; action: string; platformUserId: string | null; metadata: unknown }>).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDateTime(row.performedAt)}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs">{row.action}</code>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {row.platformUserId?.slice(0, 8) ?? "—"}
                          </TableCell>
                          <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground">
                            {row.metadata
                              ? JSON.stringify(row.metadata)
                              : "—"}
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
      )}

      {tenant ? (
        <Dialog open={exemptDialogOpen} onOpenChange={setExemptDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {tenant.billingExempt
                  ? "Fakturierung aktivieren?"
                  : "Tenant von Fakturierung ausnehmen?"}
              </DialogTitle>
              <DialogDescription asChild>
                <div>
                  {tenant.billingExempt ? (
                    <>
                      Nach dem Umschalten werden zukünftige Modul-Aktivierungen
                      wieder automatisch Abos erzeugen.{" "}
                      <strong>
                        Bereits aktive Module bekommen KEIN rückwirkendes Abo
                      </strong>{" "}
                      — dafür müssen die Module einmal deaktiviert und wieder
                      aktiviert werden.
                    </>
                  ) : (
                    <>
                      Zukünftige Modul-Aktivierungen erzeugen keine Abos mehr.{" "}
                      <strong>
                        Bestehende aktive Abos werden NICHT automatisch gekündigt
                      </strong>{" "}
                      — diese müssen im Modul-Bereich manuell per Deaktivieren
                      beendet werden.
                    </>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="exemptReason">Grund (Audit-Log)</Label>
              <Textarea
                id="exemptReason"
                value={exemptReason}
                onChange={(e) => setExemptReason(e.target.value)}
                placeholder="Z. B. Vertriebspartner lt. Rahmenvertrag vom …"
                required
                minLength={3}
                maxLength={500}
              />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setExemptDialogOpen(false)}
              >
                Abbrechen
              </Button>
              <Button
                onClick={() =>
                  setExemptMutation.mutate({
                    id: tenant.id,
                    billingExempt: !tenant.billingExempt,
                    reason: exemptReason.trim(),
                  })
                }
                disabled={
                  exemptReason.trim().length < 3 || setExemptMutation.isPending
                }
              >
                {setExemptMutation.isPending ? "Wird gespeichert…" : "Bestätigen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

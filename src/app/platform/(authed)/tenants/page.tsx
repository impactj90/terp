"use client"

/**
 * Platform tenants list.
 *
 * Phase 9 extensions: actions dropdown per row (Details · Module verwalten ·
 * Deaktivieren/Reaktivieren · Löschen) plus a "+ Neuer Tenant" quick action
 * in the card header. Search + status filter run server-side via
 * `tenantManagement.list` which paginates and returns counts.
 */
import { useState } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Search,
  Copy,
  Plus,
  MoreHorizontal,
  Settings2,
  PowerOff,
  Power,
  Trash2,
} from "lucide-react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

type StatusFilter = "all" | "active" | "inactive"

function buildAccessTemplate(tenantName: string): string {
  return [
    `Guten Tag,`,
    ``,
    `um Ihnen bei Ihrer Anfrage im Terp-Mandanten "${tenantName}" zu helfen,`,
    `benötigen wir temporären Lesezugriff auf Ihr System.`,
    ``,
    `Bitte öffnen Sie dazu in Terp unter "Einstellungen > Support-Zugriff"`,
    `eine neue Support-Session und senden uns die Bestätigungs-ID zurück.`,
    ``,
    `Vielen Dank.`,
  ].join("\n")
}

type ReasonDialogState =
  | { kind: "deactivate"; id: string; name: string }
  | { kind: "soft_delete"; id: string; name: string }
  | null

export default function PlatformTenantsPage() {
  const trpc = usePlatformTRPC()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [page, setPage] = useState(1)
  const [reasonDialog, setReasonDialog] = useState<ReasonDialogState>(null)
  const [reasonText, setReasonText] = useState("")

  const listQuery = useQuery(
    trpc.tenantManagement.list.queryOptions({
      search: query.trim() || undefined,
      status,
      page,
      pageSize: 20,
    }),
  )

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.tenantManagement.list.queryKey(),
    })
  }

  const deactivateMutation = useMutation({
    ...trpc.tenantManagement.deactivate.mutationOptions(),
    onSuccess: () => {
      toast.success("Tenant deaktiviert")
      invalidate()
      setReasonDialog(null)
      setReasonText("")
    },
    onError: (err) => toast.error(err.message ?? "Deaktivierung fehlgeschlagen"),
  })

  const reactivateMutation = useMutation({
    ...trpc.tenantManagement.reactivate.mutationOptions(),
    onSuccess: () => {
      toast.success("Tenant reaktiviert")
      invalidate()
    },
    onError: (err) => toast.error(err.message ?? "Reaktivierung fehlgeschlagen"),
  })

  const softDeleteMutation = useMutation({
    ...trpc.tenantManagement.softDelete.mutationOptions(),
    onSuccess: () => {
      toast.success("Tenant archiviert")
      invalidate()
      setReasonDialog(null)
      setReasonText("")
    },
    onError: (err) => toast.error(err.message ?? "Archivierung fehlgeschlagen"),
  })

  async function copyTemplate(tenantName: string) {
    const text = buildAccessTemplate(tenantName)
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Vorlage in Zwischenablage kopiert")
    } catch {
      toast.error("Kopieren fehlgeschlagen")
    }
  }

  function submitReasonDialog() {
    if (!reasonDialog) return
    if (reasonText.trim().length < 3) {
      toast.error("Bitte eine Begründung eingeben (mindestens 3 Zeichen)")
      return
    }
    if (reasonDialog.kind === "deactivate") {
      deactivateMutation.mutate({ id: reasonDialog.id, reason: reasonText.trim() })
    } else {
      softDeleteMutation.mutate({ id: reasonDialog.id, reason: reasonText.trim() })
    }
  }

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const pageSize = listQuery.data?.pageSize ?? 20
  const maxPage = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mandanten-Verwaltung. Erstellen, bearbeiten, Module buchen.
          </p>
        </div>
        <Button asChild>
          <Link href="/platform/tenants/new">
            <Plus className="mr-1 size-4" />
            Neuer Tenant
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suche</CardTitle>
          <CardDescription>
            Suche nach Name oder Slug. Seitenweise, max. 20 Ergebnisse pro Seite.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Name oder Slug…"
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as StatusFilter)
              setPage(1)
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="active">Nur aktiv</SelectItem>
              <SelectItem value="inactive">Nur inaktiv</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ergebnisse</CardTitle>
          <CardDescription>
            {listQuery.isLoading ? "Wird geladen…" : `${total} Tenants`}
          </CardDescription>
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
              Keine Tenants gefunden.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link
                        href={`/platform/tenants/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.name}
                      </Link>
                      {t.isDemo ? (
                        <Badge variant="secondary" className="ml-2">
                          Demo
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {t.slug}
                    </TableCell>
                    <TableCell>
                      {t.isActive ? (
                        <Badge variant="secondary">Aktiv</Badge>
                      ) : (
                        <Badge variant="outline">Inaktiv</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyTemplate(t.name)}
                          title="Zugriffsanfrage-Vorlage"
                        >
                          <Copy className="size-3" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline">
                              <MoreHorizontal className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/platform/tenants/${t.id}`}>
                                Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/platform/tenants/${t.id}/modules`}>
                                <Settings2 className="mr-2 size-3" />
                                Module verwalten
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {t.isActive ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  setReasonDialog({
                                    kind: "deactivate",
                                    id: t.id,
                                    name: t.name,
                                  })
                                }
                              >
                                <PowerOff className="mr-2 size-3" />
                                Deaktivieren
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() =>
                                  reactivateMutation.mutate({ id: t.id })
                                }
                                disabled={reactivateMutation.isPending}
                              >
                                <Power className="mr-2 size-3" />
                                Reaktivieren
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() =>
                                setReasonDialog({
                                  kind: "soft_delete",
                                  id: t.id,
                                  name: t.name,
                                })
                              }
                            >
                              <Trash2 className="mr-2 size-3" />
                              Löschen (Soft)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {total > pageSize ? (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Seite {page} von {maxPage}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Zurück
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= maxPage}
                  onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                >
                  Weiter
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={reasonDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReasonDialog(null)
            setReasonText("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reasonDialog?.kind === "deactivate"
                ? `Tenant deaktivieren: ${reasonDialog?.name}`
                : `Tenant archivieren: ${reasonDialog?.name}`}
            </DialogTitle>
            <DialogDescription>
              {reasonDialog?.kind === "deactivate"
                ? "Der Tenant wird auf inaktiv gesetzt. Bestehende Benutzer können sich nicht mehr anmelden. Aktion ist reversibel via Reaktivieren."
                : "Der Tenant wird archiviert und auf inaktiv gesetzt. Aktion ist im Audit-Log nachvollziehbar."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Begründung (Pflichtfeld)</Label>
            <Textarea
              id="reason"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={3}
              placeholder="z.B. Kündigung zum 31.12., Testaccount, …"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setReasonDialog(null)
                setReasonText("")
              }}
            >
              Abbrechen
            </Button>
            <Button
              onClick={submitReasonDialog}
              disabled={
                deactivateMutation.isPending || softDeleteMutation.isPending
              }
              variant={
                reasonDialog?.kind === "soft_delete" ? "destructive" : "default"
              }
            >
              Bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

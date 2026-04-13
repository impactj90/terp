"use client"

/**
 * Platform tenant modules page (Phase 9).
 *
 * Operator-facing module booking UI. Shows every module from AVAILABLE_MODULES
 * and lets the operator enable/disable per tenant with an optional contract
 * reference (for later billing traceability). Empty contract reference is
 * allowed but surfaces a warning so the operator is nudged to fill it in.
 */
import { use, useState, useMemo } from "react"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Search } from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
import { AVAILABLE_MODULES } from "@/lib/modules/constants"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const MODULE_LABELS: Record<string, string> = {
  core: "Kern",
  crm: "CRM",
  billing: "Fakturierung",
  warehouse: "Lager",
  inbound_invoices: "Eingangsrechnungen",
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("de-DE")
}

type EnableDialogState = { moduleKey: string } | null
type DisableDialogState = { moduleKey: string } | null

export default function PlatformTenantModulesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: tenantId } = use(params)
  const trpc = usePlatformTRPC()
  const queryClient = useQueryClient()

  const detailQuery = useQuery(
    trpc.tenantManagement.getById.queryOptions({ id: tenantId }),
  )
  const modulesQuery = useQuery(
    trpc.tenantManagement.listModules.queryOptions({ tenantId }),
  )
  const subscriptionsQuery = useQuery(
    trpc.tenantManagement.listSubscriptions.queryOptions({ tenantId }),
  )

  const [search, setSearch] = useState("")
  const [enableDialog, setEnableDialog] = useState<EnableDialogState>(null)
  const [operatorNote, setOperatorNote] = useState("")
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "ANNUALLY">("MONTHLY")
  const [disableDialog, setDisableDialog] = useState<DisableDialogState>(null)
  const [disableReason, setDisableReason] = useState("")

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.tenantManagement.listModules.queryKey({ tenantId }),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.tenantManagement.listSubscriptions.queryKey({ tenantId }),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.tenantManagement.getById.queryKey({ id: tenantId }),
    })
  }

  const activeSubByModule = useMemo(() => {
    const map = new Map<string, NonNullable<typeof subscriptionsQuery.data>[number]>()
    for (const sub of subscriptionsQuery.data ?? []) {
      if (sub.status === "active") map.set(sub.module, sub)
    }
    return map
  }, [subscriptionsQuery.data])

  const enableMutation = useMutation({
    ...trpc.tenantManagement.enableModule.mutationOptions(),
    onSuccess: () => {
      toast.success("Modul aktiviert")
      invalidate()
      setEnableDialog(null)
      setOperatorNote("")
      setBillingCycle("MONTHLY")
    },
    onError: (err) => toast.error(err.message ?? "Aktivierung fehlgeschlagen"),
  })

  const disableMutation = useMutation({
    ...trpc.tenantManagement.disableModule.mutationOptions(),
    onSuccess: () => {
      toast.success("Modul deaktiviert")
      invalidate()
      setDisableDialog(null)
      setDisableReason("")
    },
    onError: (err) => toast.error(err.message ?? "Deaktivierung fehlgeschlagen"),
  })

  const rows = modulesQuery.data ?? []
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => {
      const ref = r.operatorNote?.toLowerCase() ?? ""
      const label = (MODULE_LABELS[r.module] ?? r.module).toLowerCase()
      return ref.includes(needle) || r.module.includes(needle) || label.includes(needle)
    })
  }, [rows, search])

  const tenantName = detailQuery.data?.tenant.name
  const tenant = detailQuery.data?.tenant

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/platform/tenants/${tenantId}`}>
            <ArrowLeft className="mr-1 size-4" />
            Zurück
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Module verwalten</h1>
        {tenantName ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Tenant: <span className="font-medium">{tenantName}</span>
          </p>
        ) : null}
      </div>

      {tenant?.billingExempt ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <strong>Nicht fakturierbar:</strong> Dieser Tenant ist von
          automatischer Fakturierung ausgenommen. Modul-Buchungen legen eine
          CRM-Adresse im Operator-Tenant an, erzeugen aber keine Abos oder
          wiederkehrenden Rechnungen.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Modul-Buchungen</CardTitle>
          <CardDescription>
            Gebuchte Module und laufende Abonnements für diesen Tenant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Nach Modul oder Notiz suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {modulesQuery.isLoading ? (
            <div className="space-y-2">
              {AVAILABLE_MODULES.map((m) => (
                <Skeleton key={m} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modul</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktiviert am</TableHead>
                  <TableHead>Notiz</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Abo</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const isCore = row.module === "core"
                  return (
                    <TableRow key={row.module}>
                      <TableCell>
                        <div className="font-medium">
                          {MODULE_LABELS[row.module] ?? row.module}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {row.module}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.enabled ? (
                          <Badge variant="secondary">Aktiv</Badge>
                        ) : (
                          <Badge variant="outline">Inaktiv</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(row.enabledAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.operatorNote ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.enabledBy ? (
                          <span>
                            {row.enabledBy.displayName}
                            <span className="ml-1 text-[10px] uppercase">
                              ({row.enabledBy.kind})
                            </span>
                          </span>
                        ) : row.enabled ? (
                          "—"
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          const sub = activeSubByModule.get(row.module)
                          if (!sub) return <span className="text-muted-foreground">—</span>
                          return (
                            <div className="space-y-0.5">
                              <div>
                                <Badge variant="outline">
                                  {sub.billingCycle === "MONTHLY" ? "Monatl." : "Jährl."}
                                </Badge>{" "}
                                {sub.unitPrice.toFixed(2)} {sub.currency}
                              </div>
                              {sub.billingRecurringInvoice?.nextDueDate ? (
                                <div className="text-muted-foreground">
                                  Nächste: {formatDate(sub.billingRecurringInvoice.nextDueDate)}
                                </div>
                              ) : null}
                              {sub.lastGeneratedInvoice ? (
                                <div>
                                  <span className="font-mono">
                                    {sub.lastGeneratedInvoice.number}
                                  </span>
                                  {sub.isOverdue ? (
                                    <Badge variant="destructive" className="ml-1">
                                      überfällig
                                    </Badge>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.enabled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isCore}
                            onClick={() => {
                              setDisableDialog({ moduleKey: row.module })
                              setDisableReason("")
                            }}
                          >
                            Deaktivieren
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => {
                              setEnableDialog({ moduleKey: row.module })
                              setOperatorNote("")
                            }}
                          >
                            Aktivieren
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      Keine Module gefunden.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={enableDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEnableDialog(null)
            setOperatorNote("")
            setBillingCycle("MONTHLY")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Modul aktivieren:{" "}
              {enableDialog
                ? MODULE_LABELS[enableDialog.moduleKey] ?? enableDialog.moduleKey
                : ""}
            </DialogTitle>
            <DialogDescription>
              Optional: freier Text um diese Buchung mit einer externen Rechnung,
              einem Angebot oder einer Bestätigungsmail zu verknüpfen. Reine
              Notiz — wird nirgendwo automatisch ausgewertet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="operatorNote">Notiz</Label>
            <Input
              id="operatorNote"
              value={operatorNote}
              onChange={(e) => setOperatorNote(e.target.value)}
              placeholder="z.B. #INV-2026-042 oder 'Testaccount, nicht fakturieren'"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="billingCycle">Abrechnungszyklus</Label>
            <Select
              value={billingCycle}
              onValueChange={(v) => setBillingCycle(v as "MONTHLY" | "ANNUALLY")}
            >
              <SelectTrigger id="billingCycle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Monatlich</SelectItem>
                <SelectItem value="ANNUALLY">Jährlich</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEnableDialog(null)
                setOperatorNote("")
              }}
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                if (!enableDialog) return
                enableMutation.mutate({
                  tenantId,
                  moduleKey: enableDialog.moduleKey as
                    | "core"
                    | "crm"
                    | "billing"
                    | "warehouse"
                    | "inbound_invoices",
                  operatorNote: operatorNote.trim() || undefined,
                  billingCycle,
                })
              }}
              disabled={enableMutation.isPending}
            >
              Aktivieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={disableDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDisableDialog(null)
            setDisableReason("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Modul deaktivieren:{" "}
              {disableDialog
                ? MODULE_LABELS[disableDialog.moduleKey] ?? disableDialog.moduleKey
                : ""}
            </DialogTitle>
            <DialogDescription>
              Die Buchung wird entfernt. Optional kann ein Grund im Audit-Log
              vermerkt werden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="disableReason">Grund (optional)</Label>
            <Textarea
              id="disableReason"
              rows={3}
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              placeholder="z.B. Kündigung zum 31.12."
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDisableDialog(null)
                setDisableReason("")
              }}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!disableDialog) return
                disableMutation.mutate({
                  tenantId,
                  moduleKey: disableDialog.moduleKey as
                    | "core"
                    | "crm"
                    | "billing"
                    | "warehouse"
                    | "inbound_invoices",
                  reason: disableReason.trim() || undefined,
                })
              }}
              disabled={disableMutation.isPending}
            >
              Deaktivieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

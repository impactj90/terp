"use client"

/**
 * Platform admin demo-tenants page.
 *
 * Full lifecycle UI for demo tenants — list, create (with invite-link
 * fallback), extend, convert (with billing cycle selection + subscription
 * bridge), expire-now, delete. Row actions are context-sensitive on
 * `status`.
 *
 * Deep-link support: visiting `/platform/tenants/demo?highlight=<tenantId>`
 * scrolls to and highlights the matching row for ~2.5s. Used by the
 * convert-requests inbox "Tenant öffnen →" action (Phase 6).
 */
import * as React from "react"
import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  MoreVertical,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { usePlatformTRPC } from "@/trpc/platform/context"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

// ---- Types -----------------------------------------------------------------

type DemoCreatorDTO = {
  source: "platform" | "tenant" | "unknown"
  id: string | null
  displayName: string | null
  email: string | null
}

type DemoRowData = {
  id: string
  name: string
  slug: string
  isActive: boolean | null
  isDemo: boolean
  demoExpiresAt: Date | null
  demoTemplate: string | null
  demoNotes: string | null
  createdAt: Date | null
  daysRemaining: number
  status: "active" | "expired"
  creator: DemoCreatorDTO
}

type DemoTemplateOption = {
  key: string
  label: string
  description: string
}

// ---- Page ------------------------------------------------------------------

export default function PlatformDemoTenantsPage() {
  return (
    <Suspense fallback={<div className="space-y-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>}>
      <PlatformDemoTenantsPageInner />
    </Suspense>
  )
}

function PlatformDemoTenantsPageInner() {
  const trpc = usePlatformTRPC()
  const qc = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const highlightId = searchParams.get("highlight")

  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "active" | "expired"
  >("all")

  const listQuery = useQuery(trpc.demoTenantManagement.list.queryOptions())
  const templatesQuery = useQuery(
    trpc.demoTenantManagement.templates.queryOptions(),
  )

  // Create sheet + post-create invite-link dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [inviteLinkDialog, setInviteLinkDialog] = React.useState<{
    link: string
    tenantName: string
  } | null>(null)

  // Action dialogs
  const [extendTarget, setExtendTarget] = React.useState<DemoRowData | null>(
    null,
  )
  const [convertTarget, setConvertTarget] = React.useState<DemoRowData | null>(
    null,
  )
  const [expireTarget, setExpireTarget] = React.useState<DemoRowData | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = React.useState<DemoRowData | null>(
    null,
  )

  // Deep-link highlight (from convert-requests inbox)
  React.useEffect(() => {
    if (!highlightId || !listQuery.data) return
    const row = document.getElementById(`demo-row-${highlightId}`)
    if (!row) return
    row.scrollIntoView({ behavior: "smooth", block: "center" })
    row.classList.add("ring-2", "ring-primary", "ring-offset-2")
    const timeout = setTimeout(() => {
      row.classList.remove("ring-2", "ring-primary", "ring-offset-2")
      router.replace("/platform/tenants/demo")
    }, 2500)
    return () => clearTimeout(timeout)
  }, [highlightId, listQuery.data, router])

  const demos = (listQuery.data ?? []) as DemoRowData[]
  const filteredDemos = React.useMemo(() => {
    if (statusFilter === "all") return demos
    return demos.filter((d) => d.status === statusFilter)
  }, [demos, statusFilter])

  const invalidateList = React.useCallback(() => {
    qc.invalidateQueries({
      queryKey: trpc.demoTenantManagement.list.queryKey(),
    })
  }, [qc, trpc])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Demo-Tenants</h1>
          <p className="text-muted-foreground">
            Erzeuge und verwalte Demo-Tenants für Sales-Demos und Evaluierungen.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Neuer Demo-Tenant
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Übersicht</CardTitle>
            <CardDescription>
              Alle Demo-Tenants (aktiv + abgelaufen).
            </CardDescription>
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              setStatusFilter(v as typeof statusFilter)
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="expired">Abgelaufen</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : filteredDemos.length === 0 ? (
            <div className="py-10 px-6 text-center">
              <p className="text-sm text-muted-foreground">
                Keine Demo-Tenants vorhanden.
              </p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Ersten Demo-Tenant anlegen
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / Slug</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Creator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Läuft ab</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDemos.map((demo) => (
                  <DemoRow
                    key={demo.id}
                    demo={demo}
                    onExtend={() => setExtendTarget(demo)}
                    onConvert={() => setConvertTarget(demo)}
                    onExpire={() => setExpireTarget(demo)}
                    onDelete={() => setDeleteTarget(demo)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateDemoSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        templates={templatesQuery.data ?? []}
        onSuccess={(result) => {
          setCreateOpen(false)
          if (result.inviteLink) {
            setInviteLinkDialog({
              link: result.inviteLink,
              tenantName: result.tenantName,
            })
          } else {
            toast.success(
              `Demo-Tenant "${result.tenantName}" erstellt — Willkommens-E-Mail versendet`,
            )
          }
          invalidateList()
        }}
      />

      <InviteLinkDialog
        open={!!inviteLinkDialog}
        onOpenChange={(open) => !open && setInviteLinkDialog(null)}
        data={inviteLinkDialog}
      />

      <ExtendDialog
        target={extendTarget}
        onClose={() => setExtendTarget(null)}
        onSuccess={() => {
          setExtendTarget(null)
          invalidateList()
        }}
      />

      <ConvertDialog
        target={convertTarget}
        onClose={() => setConvertTarget(null)}
        onSuccess={() => {
          setConvertTarget(null)
          invalidateList()
        }}
      />

      <ExpireNowDialog
        target={expireTarget}
        onClose={() => setExpireTarget(null)}
        onSuccess={() => {
          setExpireTarget(null)
          invalidateList()
        }}
      />

      <DeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onSuccess={() => {
          setDeleteTarget(null)
          invalidateList()
        }}
      />
    </div>
  )
}

// ---- Row + badges ----------------------------------------------------------

function DemoRow({
  demo,
  onExtend,
  onConvert,
  onExpire,
  onDelete,
}: {
  demo: DemoRowData
  onExtend: () => void
  onConvert: () => void
  onExpire: () => void
  onDelete: () => void
}) {
  return (
    <TableRow
      id={`demo-row-${demo.id}`}
      className="transition-shadow duration-300"
    >
      <TableCell>
        <div className="font-medium">{demo.name}</div>
        <div className="text-xs text-muted-foreground">{demo.slug}</div>
      </TableCell>
      <TableCell className="font-mono text-xs">
        {demo.demoTemplate ?? "—"}
      </TableCell>
      <TableCell>
        <CreatorBadge creator={demo.creator} />
      </TableCell>
      <TableCell>
        <StatusBadge status={demo.status} daysRemaining={demo.daysRemaining} />
      </TableCell>
      <TableCell>
        {demo.demoExpiresAt
          ? new Date(demo.demoExpiresAt).toLocaleDateString("de-DE")
          : "—"}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onExtend}>
              Verlängern (7/14 Tage)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onConvert}>Konvertieren</DropdownMenuItem>
            <DropdownMenuSeparator />
            {demo.status === "active" && (
              <DropdownMenuItem
                onClick={onExpire}
                className="text-destructive"
              >
                Jetzt ablaufen lassen
              </DropdownMenuItem>
            )}
            {demo.status === "expired" && (
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive"
              >
                Löschen
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

function CreatorBadge({ creator }: { creator: DemoCreatorDTO }) {
  if (creator.source === "unknown") {
    return <span className="text-muted-foreground italic">unbekannt</span>
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm">{creator.displayName ?? "—"}</span>
      <div className="flex items-center gap-1">
        <Badge
          variant={creator.source === "platform" ? "default" : "secondary"}
          className="text-xs"
        >
          {creator.source === "platform" ? "Platform" : "Tenant"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {creator.email ?? ""}
        </span>
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  daysRemaining,
}: {
  status: "active" | "expired"
  daysRemaining: number
}) {
  if (status === "expired") {
    return <Badge variant="destructive">Abgelaufen</Badge>
  }
  if (daysRemaining <= 3) {
    return <Badge variant="outline">Noch {daysRemaining} Tage</Badge>
  }
  return <Badge variant="secondary">Aktiv ({daysRemaining} Tage)</Badge>
}

// ---- Create sheet ----------------------------------------------------------

type CreateDemoSuccess = {
  tenantName: string
  inviteLink: string | null
}

function CreateDemoSheet({
  open,
  onOpenChange,
  templates,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: DemoTemplateOption[]
  onSuccess: (result: CreateDemoSuccess) => void
}) {
  const trpc = usePlatformTRPC()

  const [tenantName, setTenantName] = React.useState("")
  const [tenantSlug, setTenantSlug] = React.useState("")
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [addressStreet, setAddressStreet] = React.useState("")
  const [addressZip, setAddressZip] = React.useState("")
  const [addressCity, setAddressCity] = React.useState("")
  const [addressCountry, setAddressCountry] = React.useState("Deutschland")
  const [adminEmail, setAdminEmail] = React.useState("")
  const [adminDisplayName, setAdminDisplayName] = React.useState("")
  const [demoTemplate, setDemoTemplate] = React.useState<string>("")
  const [demoDurationDays, setDemoDurationDays] = React.useState("14")
  const [notes, setNotes] = React.useState("")

  React.useEffect(() => {
    if (!slugTouched) setTenantSlug(slugify(tenantName))
  }, [tenantName, slugTouched])

  React.useEffect(() => {
    if (!demoTemplate && templates.length > 0) {
      setDemoTemplate(templates[0]!.key)
    }
  }, [templates, demoTemplate])

  const createMutation = useMutation({
    ...trpc.demoTenantManagement.create.mutationOptions(),
    onSuccess: (data) => {
      onSuccess({
        tenantName: tenantName.trim(),
        inviteLink: data.inviteLink ?? null,
      })
      resetForm()
    },
    onError: (err) => {
      toast.error(err.message ?? "Anlegen fehlgeschlagen")
    },
  })

  function resetForm() {
    setTenantName("")
    setTenantSlug("")
    setSlugTouched(false)
    setAddressStreet("")
    setAddressZip("")
    setAddressCity("")
    setAddressCountry("Deutschland")
    setAdminEmail("")
    setAdminDisplayName("")
    setDemoTemplate(templates[0]?.key ?? "")
    setDemoDurationDays("14")
    setNotes("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    createMutation.mutate({
      tenantName: tenantName.trim(),
      tenantSlug: tenantSlug.trim(),
      addressStreet: addressStreet.trim(),
      addressZip: addressZip.trim(),
      addressCity: addressCity.trim(),
      addressCountry: addressCountry.trim(),
      adminEmail: adminEmail.trim(),
      adminDisplayName: adminDisplayName.trim(),
      demoTemplate,
      demoDurationDays: Number.parseInt(demoDurationDays, 10),
      notes: notes.trim() || null,
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Neuer Demo-Tenant</SheetTitle>
          <SheetDescription>
            Legt einen sandboxing-fertigen Demo-Tenant mit Admin-Account und
            Template-Daten an.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 mt-4 px-4 sm:px-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tenant</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="tenantName">Firmenname</Label>
                <Input
                  id="tenantName"
                  required
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="Acme Demo GmbH"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenantSlug">Slug</Label>
                <Input
                  id="tenantSlug"
                  required
                  value={tenantSlug}
                  onChange={(e) => {
                    setTenantSlug(e.target.value)
                    setSlugTouched(true)
                  }}
                  pattern="[a-z0-9\\-]+"
                  placeholder="acme-demo"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Adresse</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="addressStreet">Straße</Label>
                <Input
                  id="addressStreet"
                  required
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressZip">PLZ</Label>
                <Input
                  id="addressZip"
                  required
                  value={addressZip}
                  onChange={(e) => setAddressZip(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressCity">Ort</Label>
                <Input
                  id="addressCity"
                  required
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="addressCountry">Land</Label>
                <Input
                  id="addressCountry"
                  required
                  value={addressCountry}
                  onChange={(e) => setAddressCountry(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Admin + Demo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Admin-E-Mail</Label>
                <Input
                  id="adminEmail"
                  required
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminDisplayName">Admin-Anzeigename</Label>
                <Input
                  id="adminDisplayName"
                  required
                  value={adminDisplayName}
                  onChange={(e) => setAdminDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demoTemplate">Template</Label>
                <Select value={demoTemplate} onValueChange={setDemoTemplate}>
                  <SelectTrigger id="demoTemplate">
                    <SelectValue placeholder="Template wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.key} value={tpl.key}>
                        {tpl.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="demoDurationDays">Laufzeit (Tage)</Label>
                <Input
                  id="demoDurationDays"
                  type="number"
                  min={1}
                  max={90}
                  value={demoDurationDays}
                  onChange={(e) => setDemoDurationDays(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notizen (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Sales-Kontext, Deal-Status, …"
                />
              </div>
            </CardContent>
          </Card>

          <SheetFooter className="flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Anlegen
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---- Post-create invite-link dialog ----------------------------------------

function InviteLinkDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: { link: string; tenantName: string } | null
}) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Kopieren fehlgeschlagen")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Einladungslink manuell weitergeben</DialogTitle>
          <DialogDescription>
            Die Willkommens-E-Mail für {data?.tenantName ?? "den Demo-Tenant"}{" "}
            konnte nicht automatisch versendet werden (SMTP fehlt oder
            Zustellung fehlgeschlagen). Bitte kopiere den Setup-Link und sende
            ihn manuell an den Admin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Setup-Link</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={data?.link ?? ""}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copy}
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fertig</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Extend dialog ---------------------------------------------------------

function ExtendDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: DemoRowData | null
  onClose: () => void
  onSuccess: () => void
}) {
  const trpc = usePlatformTRPC()
  const extendMutation = useMutation({
    ...trpc.demoTenantManagement.extend.mutationOptions(),
    onSuccess: () => {
      toast.success("Demo-Laufzeit verlängert")
      onSuccess()
    },
    onError: (err) => toast.error(err.message ?? "Verlängern fehlgeschlagen"),
  })

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Demo verlängern</DialogTitle>
          <DialogDescription>
            Um wie viele Tage soll &quot;{target?.name}&quot; verlängert werden?
            Abgelaufene Demos werden dabei automatisch reaktiviert.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() =>
              target &&
              extendMutation.mutate({
                tenantId: target.id,
                additionalDays: 7,
              })
            }
            disabled={extendMutation.isPending}
          >
            + 7 Tage
          </Button>
          <Button
            className="flex-1"
            onClick={() =>
              target &&
              extendMutation.mutate({
                tenantId: target.id,
                additionalDays: 14,
              })
            }
            disabled={extendMutation.isPending}
          >
            {extendMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            + 14 Tage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Convert dialog --------------------------------------------------------

function ConvertDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: DemoRowData | null
  onClose: () => void
  onSuccess: () => void
}) {
  const trpc = usePlatformTRPC()
  const [discardData, setDiscardData] = React.useState<"keep" | "discard">(
    "keep",
  )
  const [billingCycle, setBillingCycle] = React.useState<"MONTHLY" | "ANNUALLY">(
    "MONTHLY",
  )
  const [billingExempt, setBillingExempt] = React.useState(false)

  const convertMutation = useMutation({
    ...trpc.demoTenantManagement.convert.mutationOptions(),
    onSuccess: (data) => {
      const subCount = data.subscriptionIds.length
      if (data.failedModules.length > 0) {
        toast.warning(
          `Konvertiert mit Fehlern: ${data.failedModules.length} Modul(e) konnten nicht abonniert werden`,
        )
      } else {
        toast.success(
          subCount > 0
            ? `Tenant konvertiert. ${subCount} Abo(s) angelegt.`
            : "Tenant konvertiert (kein Abrechnungsbridge konfiguriert).",
        )
      }
      onSuccess()
    },
    onError: (err) =>
      toast.error(err.message ?? "Konvertierung fehlgeschlagen"),
  })

  React.useEffect(() => {
    if (!target) {
      setDiscardData("keep")
      setBillingCycle("MONTHLY")
      setBillingExempt(false)
    }
  }, [target])

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Demo konvertieren</DialogTitle>
          <DialogDescription>
            Wandelt &quot;{target?.name}&quot; in einen normalen Tenant um.
            Diese Aktion ist nicht rückgängig zu machen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Daten</Label>
            <RadioGroup
              value={discardData}
              onValueChange={(v) =>
                setDiscardData(v as typeof discardData)
              }
            >
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="keep" id="convert-keep" />
                <Label htmlFor="convert-keep" className="font-normal">
                  Daten behalten — Template-Daten (Employees, Bookings, …)
                  werden übernommen.
                </Label>
              </div>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value="discard" id="convert-discard" />
                <Label htmlFor="convert-discard" className="font-normal">
                  Daten verwerfen — Inhalte werden gelöscht, der Admin-Account
                  bleibt erhalten.
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="billingCycle">Abrechnungszyklus</Label>
            <Select
              value={billingCycle}
              onValueChange={(v) =>
                setBillingCycle(v as typeof billingCycle)
              }
            >
              <SelectTrigger id="billingCycle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Monatlich</SelectItem>
                <SelectItem value="ANNUALLY">Jährlich</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Für jedes aktivierte Modul wird ein Abo angelegt.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="convertBillingExempt"
              className="flex cursor-pointer items-start gap-3"
            >
              <Checkbox
                id="convertBillingExempt"
                checked={billingExempt}
                onCheckedChange={(v) => setBillingExempt(v === true)}
              />
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  Von Fakturierung ausnehmen
                </div>
                <p className="text-xs text-muted-foreground">
                  Tenant wird als „Nicht fakturierbar" markiert. Es werden
                  keine Abos angelegt; die CRM-Adresse im Operator-Tenant wird
                  trotzdem erzeugt.
                </p>
              </div>
            </label>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                Nach der Konvertierung kann der Tenant nicht wieder in einen
                Demo-Status zurückversetzt werden.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={convertMutation.isPending}
          >
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            onClick={() =>
              target &&
              convertMutation.mutate({
                tenantId: target.id,
                discardData: discardData === "discard",
                billingCycle,
                billingExempt,
              })
            }
            disabled={convertMutation.isPending}
          >
            {convertMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Konvertieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Expire-now + Delete confirm dialogs -----------------------------------

function ExpireNowDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: DemoRowData | null
  onClose: () => void
  onSuccess: () => void
}) {
  const trpc = usePlatformTRPC()
  const mutation = useMutation({
    ...trpc.demoTenantManagement.expireNow.mutationOptions(),
    onSuccess: () => {
      toast.success("Demo-Tenant abgelaufen")
      onSuccess()
    },
    onError: (err) => toast.error(err.message ?? "Ablauf fehlgeschlagen"),
  })

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      title="Demo jetzt ablaufen lassen?"
      description={
        target
          ? `"${target.name}" wird sofort als abgelaufen markiert. Der Admin sieht die /demo-expired-Seite beim nächsten Login.`
          : ""
      }
      variant="destructive"
      confirmLabel="Ablaufen lassen"
      cancelLabel="Abbrechen"
      isLoading={mutation.isPending}
      onConfirm={() => {
        if (target) mutation.mutate({ tenantId: target.id })
      }}
    />
  )
}

function DeleteDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: DemoRowData | null
  onClose: () => void
  onSuccess: () => void
}) {
  const trpc = usePlatformTRPC()
  const mutation = useMutation({
    ...trpc.demoTenantManagement.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Demo-Tenant gelöscht")
      onSuccess()
    },
    onError: (err) => toast.error(err.message ?? "Löschen fehlgeschlagen"),
  })

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      title="Demo-Tenant löschen?"
      description={
        target
          ? `"${target.name}" wird unwiderruflich gelöscht, inklusive Admin-Account und Template-Daten.`
          : ""
      }
      variant="destructive"
      confirmLabel="Löschen"
      cancelLabel="Abbrechen"
      isLoading={mutation.isPending}
      onConfirm={() => {
        if (target) mutation.mutate({ tenantId: target.id })
      }}
    />
  )
}

// ---- Helpers ---------------------------------------------------------------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

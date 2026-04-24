/**
 * WorkReport detail page — `/admin/work-reports/[id]`.
 *
 * Tabs: Details, Mitarbeiter (Assignments), Fotos (Attachments), Audit.
 * Status-driven actions in the header:
 *   - DRAFT: edit, delete, download PDF (fresh render), sign
 *   - SIGNED: download PDF (persisted archive), void
 *   - VOID:   download PDF (with STORNIERT overlay)
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 8)
 */
"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Download,
  Edit,
  FileSignature,
  Plus,
  Stamp,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"

import { useAuth } from "@/providers/auth-provider"
import { useHasPermission } from "@/hooks"
import { useAuditLogs } from "@/hooks/use-audit-logs"
import {
  useAddWorkReportAssignment,
  useConfirmWorkReportAttachmentUpload,
  useDeleteWorkReport,
  useDownloadWorkReportPdf,
  useGetWorkReportAttachmentDownloadUrl,
  useGetWorkReportAttachmentUploadUrl,
  useRemoveWorkReportAssignment,
  useRemoveWorkReportAttachment,
  useWorkReport,
} from "@/hooks/use-work-reports"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { EmployeePicker } from "@/components/employees/employee-picker"
import {
  SignatureDialog,
} from "@/components/work-reports/signature-dialog"
import { VoidDialog } from "@/components/work-reports/void-dialog"
import {
  WorkReportFormSheet,
} from "@/components/work-reports/work-report-form-sheet"
import {
  WorkReportStatusBadge,
} from "@/components/work-reports/work-report-status-badge"

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}.${m}.${y}`
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–"
  try {
    return format(new Date(iso), "dd.MM.yyyy HH:mm")
  } catch {
    return iso
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function WorkReportDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id as string

  const { isLoading: authLoading } = useAuth()
  const { allowed: canView, isLoading: permLoading } = useHasPermission([
    "work_reports.view",
    "work_reports.manage",
  ])
  const { allowed: canManage } = useHasPermission(["work_reports.manage"])
  const { allowed: canSign } = useHasPermission(["work_reports.sign"])
  const { allowed: canVoid } = useHasPermission(["work_reports.void"])

  const { data: report, isLoading } = useWorkReport(
    id,
    !authLoading && !permLoading && canView,
  )

  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [signOpen, setSignOpen] = React.useState(false)
  const [voidOpen, setVoidOpen] = React.useState(false)

  // Assignments state
  const [assignEmployeeId, setAssignEmployeeId] = React.useState<string | null>(
    null,
  )
  const [assignRole, setAssignRole] = React.useState("")
  const [removeAssignmentId, setRemoveAssignmentId] = React.useState<
    string | null
  >(null)

  // Attachments state
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [removeAttachmentId, setRemoveAttachmentId] = React.useState<
    string | null
  >(null)

  // Mutations
  const deleteMutation = useDeleteWorkReport()
  const downloadMutation = useDownloadWorkReportPdf()
  const addAssignmentMutation = useAddWorkReportAssignment()
  const removeAssignmentMutation = useRemoveWorkReportAssignment()
  const getUploadUrlMutation = useGetWorkReportAttachmentUploadUrl()
  const confirmUploadMutation = useConfirmWorkReportAttachmentUpload()
  const getAttachmentDownloadUrlMutation =
    useGetWorkReportAttachmentDownloadUrl()
  const removeAttachmentMutation = useRemoveWorkReportAttachment()

  // Audit logs scoped to this WorkReport
  const { data: auditData, isLoading: auditLoading } = useAuditLogs({
    entityType: "work_report",
    entityId: id,
    pageSize: 50,
    enabled: !authLoading && !permLoading && canView && !!id,
  })

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canView) {
      router.push("/dashboard")
    }
  }, [authLoading, permLoading, canView, router])

  async function handleDownloadPdf() {
    try {
      const res = await downloadMutation.mutateAsync({ id })
      if (res?.signedUrl) {
        window.open(res.signedUrl, "_blank", "noopener,noreferrer")
      }
    } catch (err) {
      const e = err as { message?: string }
      toast.error(e.message ?? "PDF-Download fehlgeschlagen.")
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync({ id })
      toast.success("Arbeitsschein gelöscht")
      router.push("/admin/work-reports")
    } catch (err) {
      const e = err as { message?: string }
      toast.error(e.message ?? "Löschen fehlgeschlagen.")
    }
  }

  async function handleAddAssignment() {
    if (!assignEmployeeId) {
      toast.error("Bitte einen Mitarbeiter auswählen.")
      return
    }
    try {
      await addAssignmentMutation.mutateAsync({
        workReportId: id,
        employeeId: assignEmployeeId,
        role: assignRole.trim() || null,
      })
      setAssignEmployeeId(null)
      setAssignRole("")
      toast.success("Mitarbeiter hinzugefügt")
    } catch (err) {
      const e = err as { message?: string }
      toast.error(e.message ?? "Hinzufügen fehlgeschlagen.")
    }
  }

  async function handleRemoveAssignmentConfirmed() {
    if (!removeAssignmentId) return
    try {
      await removeAssignmentMutation.mutateAsync({ id: removeAssignmentId })
      setRemoveAssignmentId(null)
      toast.success("Mitarbeiter entfernt")
    } catch (err) {
      const e = err as { message?: string }
      toast.error(e.message ?? "Entfernen fehlgeschlagen.")
    }
  }

  async function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
      toast.error(`Dateityp nicht erlaubt: ${file.type || "unbekannt"}`)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Datei überschreitet 10 MB.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    setUploading(true)
    try {
      const meta = await getUploadUrlMutation.mutateAsync({
        workReportId: id,
        filename: file.name,
        mimeType: file.type,
      })
      if (!meta) throw new Error("Upload-URL konnte nicht erstellt werden.")
      const putRes = await fetch(meta.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!putRes.ok) {
        throw new Error(`Upload fehlgeschlagen: HTTP ${putRes.status}`)
      }
      await confirmUploadMutation.mutateAsync({
        workReportId: id,
        storagePath: meta.storagePath,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })
      toast.success("Foto hochgeladen")
    } catch (err) {
      const e = err as { message?: string }
      toast.error(e.message ?? "Upload fehlgeschlagen.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleAttachmentDownload(attachmentId: string) {
    try {
      const res = await getAttachmentDownloadUrlMutation.mutateAsync({
        attachmentId,
      })
      if (res?.signedUrl) {
        window.open(res.signedUrl, "_blank", "noopener,noreferrer")
      }
    } catch (err) {
      const e = err as { message?: string }
      toast.error(e.message ?? "Download fehlgeschlagen.")
    }
  }

  async function handleRemoveAttachmentConfirmed() {
    if (!removeAttachmentId) return
    try {
      await removeAttachmentMutation.mutateAsync({
        attachmentId: removeAttachmentId,
      })
      setRemoveAttachmentId(null)
      toast.success("Foto entfernt")
    } catch (err) {
      const e = err as { message?: string }
      toast.error(e.message ?? "Entfernen fehlgeschlagen.")
    }
  }

  if (authLoading || permLoading || isLoading) return <DetailSkeleton />
  if (!report) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Arbeitsschein nicht gefunden.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/admin/work-reports")}
        >
          Zurück zur Liste
        </Button>
      </div>
    )
  }

  const isDraft = report.status === "DRAFT"
  const isSigned = report.status === "SIGNED"
  const isVoid = report.status === "VOID"
  const logs = auditData?.items ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/admin/work-reports")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zurück</TooltipContent>
        </Tooltip>
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
          <Stamp className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-2xl font-bold tracking-tight">
              {report.code}
            </h1>
            <WorkReportStatusBadge status={report.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Einsatz am {formatDate(report.visitDate)}
            {report.order && (
              <>
                {" · "}Auftrag <span className="font-mono">{report.order.code}</span>
                {" — "}
                {report.order.name}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={downloadMutation.isPending}
          >
            <Download className="mr-2 h-4 w-4" /> PDF herunterladen
          </Button>
          {isDraft && canManage && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" /> Bearbeiten
            </Button>
          )}
          {isDraft && canSign && (
            <Button onClick={() => setSignOpen(true)}>
              <FileSignature className="mr-2 h-4 w-4" /> Signieren
            </Button>
          )}
          {isSigned && canVoid && (
            <Button
              variant="outline"
              onClick={() => setVoidOpen(true)}
              className="text-destructive"
            >
              <XCircle className="mr-2 h-4 w-4" /> Stornieren
            </Button>
          )}
          {isDraft && canManage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Löschen</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Void-note banner */}
      {isVoid && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium text-destructive">
                  Storniert am {formatDateTime(report.voidedAt)}
                </p>
                {report.voidReason && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Grund: {report.voidReason}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="assignments">Mitarbeiter</TabsTrigger>
          <TabsTrigger value="attachments">Fotos</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* Details */}
        <TabsContent value="details" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Stammdaten</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DetailRow label="Einsatzdatum" value={formatDate(report.visitDate)} />
                <DetailRow
                  label="Anfahrt-Minuten"
                  value={report.travelMinutes != null ? String(report.travelMinutes) : null}
                />
                <DetailRow
                  label="Auftrag"
                  value={
                    report.order
                      ? `${report.order.code} — ${report.order.name}`
                      : null
                  }
                />
                <DetailRow
                  label="Kunde"
                  value={report.order?.customer ?? null}
                />
                <DetailRow
                  label="Serviceobjekt"
                  value={
                    report.serviceObject
                      ? `${report.serviceObject.number} — ${report.serviceObject.name}`
                      : null
                  }
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Signatur</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DetailRow
                  label="Status"
                  value={
                    <WorkReportStatusBadge status={report.status} />
                  }
                />
                <DetailRow
                  label="Signiert am"
                  value={formatDateTime(report.signedAt)}
                />
                <DetailRow
                  label="Unterzeichner"
                  value={report.signerName ?? null}
                />
                <DetailRow label="Rolle" value={report.signerRole ?? null} />
                <DetailRow
                  label="IP-Hash (gekürzt)"
                  value={
                    report.signerIpHash
                      ? `${report.signerIpHash.slice(0, 8)}…`
                      : null
                  }
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Arbeitsbeschreibung</CardTitle>
            </CardHeader>
            <CardContent>
              {report.workDescription ? (
                <p className="whitespace-pre-wrap text-sm">
                  {report.workDescription}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Keine Arbeitsbeschreibung erfasst. Pflicht vor dem Signieren.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assignments */}
        <TabsContent value="assignments" className="mt-6 space-y-4">
          {isDraft && canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Mitarbeiter zuweisen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label>Mitarbeiter</Label>
                    <EmployeePicker
                      value={assignEmployeeId}
                      onChange={setAssignEmployeeId}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Rolle (optional)</Label>
                    <Input
                      value={assignRole}
                      onChange={(e) => setAssignRole(e.target.value)}
                      placeholder="z. B. Monteur"
                      maxLength={50}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleAddAssignment}
                      disabled={
                        addAssignmentMutation.isPending || !assignEmployeeId
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" /> Hinzufügen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              {report.assignments.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-muted-foreground">
                    Noch keine Mitarbeiter zugewiesen.
                  </p>
                  {isDraft && (
                    <p className="text-sm text-muted-foreground">
                      Vor dem Signieren muss mindestens ein Mitarbeiter
                      zugewiesen sein.
                    </p>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Personalnummer</TableHead>
                      <TableHead>Rolle</TableHead>
                      {isDraft && canManage && (
                        <TableHead className="text-right">Aktionen</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.assignments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          {a.employee.firstName} {a.employee.lastName}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {a.employee.personnelNumber ?? "–"}
                        </TableCell>
                        <TableCell>{a.role ?? "–"}</TableCell>
                        {isDraft && canManage && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemoveAssignmentId(a.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attachments */}
        <TabsContent value="attachments" className="mt-6 space-y-4">
          {isDraft && canManage && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Fotos &amp; Dokumente</CardTitle>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelected}
                    accept={ALLOWED_MIME_TYPES.join(",")}
                    data-testid="work-report-attachment-input"
                  />
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {uploading ? "Lade hoch…" : "Hochladen"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Erlaubt: JPEG, PNG, WebP, HEIC, PDF (max. 10 MB, max. 30
                Dateien).
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              {report.attachments.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-muted-foreground">Noch keine Fotos.</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {report.attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {a.filename}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatSize(a.sizeBytes)} · {a.mimeType}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAttachmentDownload(a.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {isDraft && canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoveAttachmentId(a.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit */}
        <TabsContent value="audit" className="mt-6">
          <Card>
            <CardContent className="p-0">
              {auditLoading ? (
                <div className="p-6">
                  <Skeleton className="h-32" />
                </div>
              ) : logs.length === 0 ? (
                <div className="px-6 py-12 text-center text-muted-foreground">
                  Keine Audit-Einträge.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zeitpunkt</TableHead>
                      <TableHead>Aktion</TableHead>
                      <TableHead>Benutzer</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatDateTime(log.performedAt)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.action}</Badge>
                        </TableCell>
                        <TableCell>
                          {log.user?.email ?? log.userId ?? "–"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.ipAddress ?? "–"}
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

      {/* Sheets & dialogs */}
      <WorkReportFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        existing={{
          id: report.id,
          orderId: report.orderId,
          serviceObjectId: report.serviceObjectId,
          visitDate: report.visitDate,
          travelMinutes: report.travelMinutes,
          workDescription: report.workDescription,
        }}
        onSuccess={() => setEditOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Arbeitsschein löschen"
        description="Dieser Arbeitsschein (Entwurf) wird endgültig gelöscht. Verknüpfte Fotos und Mitarbeiter werden entfernt."
        confirmLabel="Löschen"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      <SignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        workReport={
          isDraft
            ? {
                id: report.id,
                code: report.code,
                visitDate: report.visitDate,
                workDescription: report.workDescription,
                order: report.order
                  ? { code: report.order.code, name: report.order.name }
                  : null,
                assignments: report.assignments,
              }
            : null
        }
      />

      <VoidDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        workReport={
          isSigned ? { id: report.id, code: report.code } : null
        }
      />

      <ConfirmDialog
        open={!!removeAssignmentId}
        onOpenChange={(o) => !o && setRemoveAssignmentId(null)}
        title="Mitarbeiter entfernen"
        description="Möchten Sie diesen Mitarbeiter vom Arbeitsschein entfernen?"
        confirmLabel="Entfernen"
        variant="destructive"
        isLoading={removeAssignmentMutation.isPending}
        onConfirm={handleRemoveAssignmentConfirmed}
      />

      <ConfirmDialog
        open={!!removeAttachmentId}
        onOpenChange={(o) => !o && setRemoveAttachmentId(null)}
        title="Foto entfernen"
        description="Die Datei wird aus dem Speicher gelöscht."
        confirmLabel="Entfernen"
        variant="destructive"
        isLoading={removeAttachmentMutation.isPending}
        onConfirm={handleRemoveAttachmentConfirmed}
      />
    </div>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "–"}</span>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-[400px]" />
    </div>
  )
}

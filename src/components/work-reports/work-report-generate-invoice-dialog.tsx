/**
 * WorkReportGenerateInvoiceDialog — large modal that proposes invoice
 * positions from a SIGNED Arbeitsschein, supports inline editing,
 * adding manual positions, removing positions, and emits the generate
 * mutation. On success navigates to the new BillingDocument detail.
 *
 * UI strings hardcoded German per plan §11 — i18n is out of scope for
 * this module (matches the existing void-dialog pattern).
 *
 * Plan: 2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md (Phase E)
 */
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useGenerateWorkReportInvoice,
  useWorkReportInvoicePreview,
} from "@/hooks"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workReport: { id: string; code: string } | null
}

interface EditablePosition {
  /** Stable client-side key for React lists; not sent to the server. */
  uid: string
  kind: "labor" | "travel" | "manual"
  description: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
  sourceBookingId?: string
  /** UI-only flag from the bridge service for highlight styling. */
  requiresManualPrice: boolean
}

let UID_COUNTER = 0
function nextUid() {
  UID_COUNTER += 1
  return `pos-${UID_COUNTER}`
}

function fmt(n: number) {
  return n.toFixed(2)
}

export function WorkReportGenerateInvoiceDialog({
  open,
  onOpenChange,
  workReport,
}: Props) {
  const router = useRouter()

  const { data: preview, isLoading, error } = useWorkReportInvoicePreview(
    workReport?.id ?? "",
    open && !!workReport,
  )
  const generate = useGenerateWorkReportInvoice()

  const [positions, setPositions] = React.useState<EditablePosition[]>([])
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  // Reset local state on open + initialize from preview when it loads.
  React.useEffect(() => {
    if (open) {
      setSubmitError(null)
      setPositions([])
    }
  }, [open])

  React.useEffect(() => {
    if (open && preview?.proposedPositions) {
      setPositions(
        preview.proposedPositions.map((p) => ({
          uid: nextUid(),
          kind: p.kind,
          description: p.description,
          quantity: p.quantity,
          unit: p.unit,
          unitPrice: p.unitPrice,
          vatRate: p.vatRate,
          sourceBookingId: p.sourceBookingId,
          requiresManualPrice: p.requiresManualPrice,
        })),
      )
    }
  }, [open, preview?.proposedPositions])

  // --- Position editing helpers ---

  function updatePosition(uid: string, patch: Partial<EditablePosition>) {
    setPositions((prev) =>
      prev.map((p) => (p.uid === uid ? { ...p, ...patch } : p)),
    )
  }

  function removePosition(uid: string) {
    setPositions((prev) => prev.filter((p) => p.uid !== uid))
  }

  function addManualPosition() {
    setPositions((prev) => [
      ...prev,
      {
        uid: nextUid(),
        kind: "manual",
        description: "",
        quantity: 1,
        unit: "Stk",
        unitPrice: 0,
        vatRate: 19,
        requiresManualPrice: false,
      },
    ])
  }

  // --- Totals ---

  const netSum = positions.reduce(
    (acc, p) => acc + p.quantity * p.unitPrice,
    0,
  )
  const vatSum = positions.reduce(
    (acc, p) => acc + p.quantity * p.unitPrice * (p.vatRate / 100),
    0,
  )
  const grossSum = netSum + vatSum

  // --- Disable rules ---

  const existingInvoice = preview?.existingInvoice ?? null
  const hasNoAddress = preview?.warnings?.includes("noAddress") ?? false
  const isEmpty = positions.length === 0

  const canSubmit =
    !!workReport &&
    !existingInvoice &&
    !hasNoAddress &&
    !isEmpty &&
    !generate.isPending

  // --- Submit ---

  async function handleSubmit() {
    setSubmitError(null)
    if (!workReport) return
    if (!canSubmit) return

    try {
      const result = await generate.mutateAsync({
        workReportId: workReport.id,
        positions: positions.map((p) => ({
          kind: p.kind,
          description: p.description,
          quantity: p.quantity,
          unit: p.unit,
          unitPrice: p.unitPrice,
          vatRate: p.vatRate,
          sourceBookingId: p.sourceBookingId,
        })),
      })
      toast.success(`Rechnung ${result.billingDocumentNumber} erzeugt`)
      onOpenChange(false)
      router.push(`/orders/documents/${result.billingDocumentId}`)
    } catch (err) {
      const e = err as { message?: string }
      setSubmitError(e.message ?? "Erzeugen fehlgeschlagen.")
    }
  }

  // --- Render ---

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl sm:px-10 sm:py-8">
        <DialogHeader>
          <DialogTitle>
            Rechnung aus Arbeitsschein{" "}
            <span className="font-mono">{workReport?.code ?? ""}</span> erzeugen
          </DialogTitle>
          <DialogDescription>
            Vorschläge prüfen, ggf. anpassen, dann „Erzeugen". Die Rechnung
            wird im Status DRAFT angelegt.
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Vorschläge werden geladen…
            </span>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <Alert variant="destructive">
            <AlertDescription>
              {(error as { message?: string }).message ??
                "Vorschau konnte nicht geladen werden."}
            </AlertDescription>
          </Alert>
        )}

        {/* Loaded */}
        {!isLoading && !error && preview && (
          <div className="space-y-4 py-2">
            {/* Existing invoice — block generate */}
            {existingInvoice && (
              <Alert variant="destructive">
                <AlertDescription>
                  Für diesen Arbeitsschein existiert bereits Rechnung{" "}
                  <strong className="font-mono">
                    {existingInvoice.number}
                  </strong>{" "}
                  im Status <strong>{existingInvoice.status}</strong>.{" "}
                  <Link
                    href={`/orders/documents/${existingInvoice.id}`}
                    className="underline underline-offset-2"
                  >
                    Zur Rechnung
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            {/* No address — block generate */}
            {hasNoAddress && (
              <Alert variant="destructive">
                <AlertDescription>
                  Diesem Arbeitsschein ist kein Service-Objekt mit
                  Kunden-Adresse zugeordnet. Bitte das Service-Objekt im
                  Auftrag setzen, dann erneut versuchen.
                </AlertDescription>
              </Alert>
            )}

            {/* Empty proposals — informational only */}
            {preview.warnings.includes("noEligibleBookings") &&
              !existingInvoice && (
                <Alert>
                  <AlertDescription>
                    Diesem Arbeitsschein sind keine Buchungen zugeordnet und
                    es ist keine Anfahrt erfasst. Sie können manuelle
                    Positionen ergänzen, um trotzdem eine Rechnung anzulegen.
                  </AlertDescription>
                </Alert>
              )}

            {/* Position table */}
            {!existingInvoice && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead className="w-24 text-right">Menge</TableHead>
                      <TableHead className="w-20">Einheit</TableHead>
                      <TableHead className="w-32 text-right">Einzel</TableHead>
                      <TableHead className="w-20 text-right">VAT %</TableHead>
                      <TableHead className="w-32 text-right">Gesamt</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-sm text-muted-foreground py-6"
                        >
                          Keine Positionen.
                        </TableCell>
                      </TableRow>
                    )}
                    {positions.map((p) => {
                      const total = p.quantity * p.unitPrice
                      const priceCellClass = p.requiresManualPrice
                        ? "border-2 border-destructive rounded"
                        : ""
                      return (
                        <TableRow key={p.uid}>
                          <TableCell>
                            <Input
                              value={p.description}
                              onChange={(e) =>
                                updatePosition(p.uid, {
                                  description: e.target.value,
                                })
                              }
                              placeholder={
                                p.kind === "manual"
                                  ? "Beschreibung der manuellen Position"
                                  : ""
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={p.quantity}
                              onChange={(e) =>
                                updatePosition(p.uid, {
                                  quantity: Number(e.target.value) || 0,
                                })
                              }
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={p.unit}
                              maxLength={20}
                              onChange={(e) =>
                                updatePosition(p.uid, {
                                  unit: e.target.value,
                                })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={priceCellClass}>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={p.unitPrice}
                                    onChange={(e) =>
                                      updatePosition(p.uid, {
                                        unitPrice: Number(e.target.value) || 0,
                                      })
                                    }
                                    className="text-right"
                                  />
                                </div>
                              </TooltipTrigger>
                              {p.requiresManualPrice && (
                                <TooltipContent>
                                  Stundensatz nicht ermittelbar — bitte manuell
                                  eintragen.
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={p.vatRate}
                              onChange={(e) =>
                                updatePosition(p.uid, {
                                  vatRate: Number(e.target.value) || 0,
                                })
                              }
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(total)}
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removePosition(p.uid)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Entfernen</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addManualPosition}
                    disabled={!!existingInvoice || hasNoAddress}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Manuelle Position
                    hinzufügen
                  </Button>
                  <div className="space-y-0.5 text-right text-sm">
                    <div>
                      <Label className="mr-2 text-muted-foreground">
                        Summe netto:
                      </Label>
                      <span className="font-mono">{fmt(netSum)} EUR</span>
                    </div>
                    <div>
                      <Label className="mr-2 text-muted-foreground">
                        Summe VAT:
                      </Label>
                      <span className="font-mono">{fmt(vatSum)} EUR</span>
                    </div>
                    <div>
                      <Label className="mr-2 font-medium">
                        Summe brutto:
                      </Label>
                      <span className="font-mono font-medium">
                        {fmt(grossSum)} EUR
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generate.isPending}
          >
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {generate.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Erzeugen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

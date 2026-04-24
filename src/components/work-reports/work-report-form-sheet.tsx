/**
 * WorkReportFormSheet — Create/Edit sheet for WorkReport DRAFT records.
 *
 * When `existing` is provided the sheet opens in edit mode (update), else in
 * create mode. The only status it operates on is DRAFT — SIGNED/VOID records
 * are reached via dedicated actions (sign-dialog, void-dialog) and never by
 * this form.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 8)
 */
"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  useCreateWorkReport,
  useUpdateWorkReport,
} from "@/hooks/use-work-reports"
import { OrderCombobox } from "@/components/invoices/order-combobox"
import { ServiceObjectPicker } from "@/components/serviceobjects/service-object-picker"

export interface WorkReportFormValues {
  id?: string
  orderId?: string | null
  serviceObjectId?: string | null
  visitDate?: string | null
  travelMinutes?: number | null
  workDescription?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing?: WorkReportFormValues | null
  /** Pre-select an order when opened from the Order-detail tab. */
  defaultOrderId?: string | null
  /** Pre-select a service object when opened from the ServiceObject-detail tab. */
  defaultServiceObjectId?: string | null
  onSuccess?: (result: { id: string }) => void
}

interface FormState {
  orderId: string | null
  serviceObjectId: string | null
  visitDate: string
  travelMinutes: string
  workDescription: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function initialState(defaults?: {
  orderId?: string | null
  serviceObjectId?: string | null
}): FormState {
  return {
    orderId: defaults?.orderId ?? null,
    serviceObjectId: defaults?.serviceObjectId ?? null,
    visitDate: todayIso(),
    travelMinutes: "",
    workDescription: "",
  }
}

export function WorkReportFormSheet({
  open,
  onOpenChange,
  existing,
  defaultOrderId,
  defaultServiceObjectId,
  onSuccess,
}: Props) {
  const isEdit = !!existing?.id
  const [form, setForm] = React.useState<FormState>(initialState())
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateWorkReport()
  const updateMutation = useUpdateWorkReport()

  React.useEffect(() => {
    if (!open) return
    if (existing && existing.id) {
      setForm({
        orderId: existing.orderId ?? null,
        serviceObjectId: existing.serviceObjectId ?? null,
        visitDate: existing.visitDate ?? todayIso(),
        travelMinutes:
          existing.travelMinutes != null ? String(existing.travelMinutes) : "",
        workDescription: existing.workDescription ?? "",
      })
    } else {
      setForm(
        initialState({
          orderId: defaultOrderId ?? null,
          serviceObjectId: defaultServiceObjectId ?? null,
        }),
      )
    }
    setError(null)
  }, [open, existing, defaultOrderId, defaultServiceObjectId])

  function validate(): string | null {
    if (!form.orderId) return "Bitte einen Auftrag auswählen."
    if (!form.visitDate) return "Bitte ein Einsatzdatum auswählen."
    if (form.travelMinutes) {
      const n = Number(form.travelMinutes)
      if (!Number.isInteger(n) || n < 0 || n > 1440) {
        return "Anfahrt-Minuten muss ein Wert zwischen 0 und 1440 sein."
      }
    }
    return null
  }

  async function handleSubmit() {
    setError(null)
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    const travel = form.travelMinutes.trim() === "" ? null : Number(form.travelMinutes)
    const description = form.workDescription.trim() === "" ? null : form.workDescription
    try {
      if (isEdit && existing?.id) {
        const res = await updateMutation.mutateAsync({
          id: existing.id,
          visitDate: form.visitDate,
          travelMinutes: travel,
          workDescription: description,
          serviceObjectId: form.serviceObjectId,
        })
        onOpenChange(false)
        if (res?.id) onSuccess?.({ id: res.id })
      } else {
        const res = await createMutation.mutateAsync({
          orderId: form.orderId!,
          serviceObjectId: form.serviceObjectId,
          visitDate: form.visitDate,
          travelMinutes: travel,
          workDescription: description,
        })
        onOpenChange(false)
        if (res?.id) onSuccess?.({ id: res.id })
      }
    } catch (err) {
      const e = err as { message?: string }
      setError(e.message ?? "Speichern fehlgeschlagen.")
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? "Arbeitsschein bearbeiten" : "Neuer Arbeitsschein"}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Nur Entwürfe (DRAFT) können bearbeitet werden."
              : "Erstellen Sie einen Arbeitsschein als Entwurf. Mitarbeiter, Fotos und die Signatur erfolgen auf der Detailseite."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="-mx-6 flex-1 px-6">
          <div className="space-y-6 py-4">
            {/* Order (nur Create) */}
            {!isEdit && (
              <div className="space-y-2">
                <Label htmlFor="wr-order">Auftrag *</Label>
                <OrderCombobox
                  value={form.orderId}
                  onChange={(id) =>
                    setForm((prev) => ({ ...prev, orderId: id }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Nach dem Erstellen ist der Auftrag nicht mehr änderbar.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="wr-service-object">Serviceobjekt (optional)</Label>
              <ServiceObjectPicker
                id="wr-service-object"
                value={form.serviceObjectId}
                onChange={(id) =>
                  setForm((prev) => ({ ...prev, serviceObjectId: id }))
                }
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wr-visit-date">Einsatzdatum *</Label>
              <Input
                id="wr-visit-date"
                type="date"
                value={form.visitDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, visitDate: e.target.value }))
                }
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wr-travel-minutes">Anfahrt-Minuten</Label>
              <Input
                id="wr-travel-minutes"
                type="number"
                min={0}
                max={1440}
                step={1}
                value={form.travelMinutes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, travelMinutes: e.target.value }))
                }
                placeholder="z. B. 45"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Gesamtzeit An- und Abfahrt in Minuten.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wr-description">Arbeitsbeschreibung</Label>
              <Textarea
                id="wr-description"
                value={form.workDescription}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    workDescription: e.target.value,
                  }))
                }
                placeholder="Was wurde vor Ort ausgeführt? (Pflicht vor dem Signieren)"
                rows={6}
                maxLength={5000}
                disabled={isPending}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="flex-1"
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending
              ? "Speichere…"
              : isEdit
                ? "Speichern"
                : "Erstellen"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

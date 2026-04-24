/**
 * SignatureDialog — sheet-style dialog for capturing a signature and committing
 * a DRAFT WorkReport to SIGNED.
 *
 * Pre-checks run client-side so the user sees blocking errors before opening
 * the signature pad: missing workDescription, zero assignments. The server
 * re-validates both and will return BAD_REQUEST for scripted bypasses.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 8)
 */
"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/work-reports/signature-pad"
import { useSignWorkReport } from "@/hooks/use-work-reports"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workReport: {
    id: string
    code: string
    visitDate: string
    workDescription: string | null
    order: { code: string; name: string } | null
    assignments: unknown[]
  } | null
  onSuccess?: () => void
}

export function SignatureDialog({
  open,
  onOpenChange,
  workReport,
  onSuccess,
}: Props) {
  const [signerName, setSignerName] = React.useState("")
  const [signerRole, setSignerRole] = React.useState("")
  const [canvasEmpty, setCanvasEmpty] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const padRef = React.useRef<SignaturePadHandle | null>(null)

  const signMutation = useSignWorkReport()

  // Reset local state every time the dialog is (re-)opened.
  React.useEffect(() => {
    if (open) {
      setSignerName("")
      setSignerRole("")
      setCanvasEmpty(true)
      setError(null)
      padRef.current?.clear()
    }
  }, [open])

  const hasDescription = Boolean(
    workReport?.workDescription && workReport.workDescription.trim().length > 0,
  )
  const hasAssignment = (workReport?.assignments?.length ?? 0) > 0
  const preChecksOk = hasDescription && hasAssignment

  const nameValid = signerName.trim().length >= 2
  const roleValid = signerRole.trim().length >= 2

  const canSubmit =
    !!workReport &&
    preChecksOk &&
    nameValid &&
    roleValid &&
    !canvasEmpty &&
    !signMutation.isPending

  async function handleSubmit() {
    setError(null)
    if (!workReport) return
    const signatureDataUrl = padRef.current?.toPng()
    if (!signatureDataUrl) {
      setError("Bitte erfassen Sie eine Signatur.")
      return
    }
    try {
      await signMutation.mutateAsync({
        id: workReport.id,
        signerName: signerName.trim(),
        signerRole: signerRole.trim(),
        signatureDataUrl,
      })
      toast.success("Arbeitsschein signiert")
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const e = err as { message?: string }
      // Bubble validation errors from the server up to the dialog instead of a
      // toast so the user sees the context right next to the canvas.
      setError(e.message ?? "Signieren fehlgeschlagen.")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Arbeitsschein signieren</SheetTitle>
          <SheetDescription>
            Nach dem Signieren ist der Arbeitsschein unveränderlich. Der PDF
            wird automatisch archiviert.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="-mx-6 flex-1 px-6">
          <div className="space-y-4 py-4">
            {/* Summary */}
            {workReport && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="font-mono text-sm font-semibold">
                  {workReport.code}
                </p>
                <p className="text-xs text-muted-foreground">
                  Einsatzdatum: {workReport.visitDate}
                  {workReport.order && (
                    <>
                      {" · "}Auftrag: {workReport.order.code} — {workReport.order.name}
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Pre-check panel */}
            <div className="space-y-1 rounded-md border p-3">
              <p className="text-sm font-medium">Pflichtprüfungen</p>
              <PreCheckItem
                ok={hasDescription}
                okLabel="Arbeitsbeschreibung vorhanden"
                failLabel="Arbeitsbeschreibung fehlt — vor dem Signieren pflegen."
              />
              <PreCheckItem
                ok={hasAssignment}
                okLabel="Mindestens ein Mitarbeiter zugewiesen"
                failLabel="Mindestens ein Mitarbeiter muss zugewiesen sein."
              />
            </div>

            {!preChecksOk && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Voraussetzungen nicht erfüllt</AlertTitle>
                <AlertDescription>
                  Bitte ergänzen Sie die fehlenden Pflichtangaben auf der
                  Detailseite und öffnen Sie den Dialog erneut.
                </AlertDescription>
              </Alert>
            )}

            {/* Signer meta */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="signer-name">Name des Unterzeichners *</Label>
                <Input
                  id="signer-name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="z. B. Max Müller"
                  disabled={!preChecksOk || signMutation.isPending}
                  maxLength={255}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signer-role">Rolle / Funktion *</Label>
                <Input
                  id="signer-role"
                  value={signerRole}
                  onChange={(e) => setSignerRole(e.target.value)}
                  placeholder="z. B. Werkmeister"
                  disabled={!preChecksOk || signMutation.isPending}
                  maxLength={100}
                />
              </div>
            </div>

            {/* Canvas */}
            <div className="space-y-2">
              <Label>Signatur *</Label>
              <SignaturePad
                ref={padRef}
                disabled={!preChecksOk || signMutation.isPending}
                onChange={setCanvasEmpty}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Bitte mit Stift oder Finger signieren. Die Signatur wird
                  zusammen mit IP-Hash und Zeitstempel archiviert.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    padRef.current?.clear()
                    setCanvasEmpty(true)
                  }}
                  disabled={!preChecksOk || signMutation.isPending}
                >
                  Zurücksetzen
                </Button>
              </div>
            </div>

            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Mit dem Klick auf „Signieren" bestätigen Sie, dass der
                Arbeitsschein korrekt ist. Nach dem Signieren kann der
                Arbeitsschein nicht mehr bearbeitet werden.
              </AlertDescription>
            </Alert>

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
            disabled={signMutation.isPending}
            className="flex-1"
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1"
          >
            {signMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Signieren
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function PreCheckItem({
  ok,
  okLabel,
  failLabel,
}: {
  ok: boolean
  okLabel: string
  failLabel: string
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
      )}
      <span className={ok ? "text-foreground" : "text-destructive"}>
        {ok ? okLabel : failLabel}
      </span>
    </div>
  )
}

/**
 * VoidDialog — modal confirming SIGNED → VOID transition for a WorkReport.
 *
 * Reason is mandatory (min 10 chars trimmed). The server re-checks and will
 * return BAD_REQUEST for scripted callers.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 8)
 */
"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useVoidWorkReport } from "@/hooks/use-work-reports"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workReport: { id: string; code: string } | null
  onSuccess?: () => void
}

export function VoidDialog({ open, onOpenChange, workReport, onSuccess }: Props) {
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const voidMutation = useVoidWorkReport()

  React.useEffect(() => {
    if (open) {
      setReason("")
      setError(null)
    }
  }, [open])

  const trimmedReason = reason.trim()
  const canSubmit =
    !!workReport && trimmedReason.length >= 10 && !voidMutation.isPending

  async function handleSubmit() {
    setError(null)
    if (!workReport) return
    if (trimmedReason.length < 10) {
      setError("Begründung muss mindestens 10 Zeichen haben.")
      return
    }
    try {
      await voidMutation.mutateAsync({
        id: workReport.id,
        reason: trimmedReason,
      })
      toast.success("Arbeitsschein storniert")
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const e = err as { message?: string }
      setError(e.message ?? "Stornierung fehlgeschlagen.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Arbeitsschein stornieren</DialogTitle>
          <DialogDescription>
            {workReport
              ? `${workReport.code} wird auf STORNIERT gesetzt.`
              : "Bitte einen Arbeitsschein auswählen."}
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertDescription>
            Achtung: Dies storniert den signierten Arbeitsschein. Die
            archivierte PDF bleibt erhalten, neue PDF-Downloads zeigen den
            Storno-Diagonalstempel.
          </AlertDescription>
        </Alert>

        <div className="space-y-2 py-2">
          <Label htmlFor="void-reason">Begründung *</Label>
          <Textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Warum wird der Arbeitsschein storniert? (min. 10 Zeichen)"
            rows={4}
            maxLength={2000}
            disabled={voidMutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            {trimmedReason.length} / min. 10 Zeichen
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={voidMutation.isPending}
          >
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {voidMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Stornieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

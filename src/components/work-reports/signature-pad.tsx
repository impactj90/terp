/**
 * SignaturePad — canvas-based signature capture.
 *
 * Thin wrapper around `react-signature-canvas` that exposes an imperative
 * handle with three operations:
 *   - `isEmpty()` — is the canvas blank right now?
 *   - `toPng()`   — serialize to a PNG data-URL (base64), or `null` if the
 *                   canvas is empty or the stroke is so short it's almost
 *                   certainly an accidental tap. The parent's submit button
 *                   decides what to do with `null`.
 *   - `clear()`   — reset the canvas.
 *
 * The canvas is fixed-aspect and the underlying `react-signature-canvas`
 * bases its drawing surface on the provided `width`/`height` props. Callers
 * should pass explicit pixel dimensions — the `canvasProps.className` visual
 * width adapts via `w-full touch-none`, but the SignaturePad's pointer
 * sampling needs the intrinsic size.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 6)
 */
"use client"
import { forwardRef, useImperativeHandle, useRef } from "react"
import SignatureCanvas from "react-signature-canvas"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Imperative API exposed via `ref`. Parent dialogs call `toPng()` from
 * their submit handler to extract the signature; `isEmpty()` drives the
 * submit-button enable/disable state; `clear()` powers the "retry" UX.
 */
export interface SignaturePadHandle {
  isEmpty: () => boolean
  /** base64 PNG data URL, or `null` for empty / too-short strokes */
  toPng: () => string | null
  clear: () => void
}

interface SignaturePadProps {
  width?: number
  height?: number
  disabled?: boolean
  /**
   * Fired after each stroke (`onEnd` from react-signature-canvas) and on
   * clear. The argument is the canvas's `isEmpty()` state at that moment.
   * Parents use this to drive submit-button enable/disable without having
   * to poll or wire up pointer listeners themselves.
   */
  onChange?: (isEmpty: boolean) => void
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad(
    { width = 600, height = 200, disabled, onChange },
    ref,
  ) {
    const canvasRef = useRef<SignatureCanvas | null>(null)

    useImperativeHandle(
      ref,
      () => ({
        isEmpty: () => canvasRef.current?.isEmpty() ?? true,
        toPng: () => {
          const sig = canvasRef.current
          if (!sig || sig.isEmpty()) return null

          // Heuristic: treat single-point or very short strokes as empty.
          // Prevents accidental taps from producing a "valid" signature.
          // `toData()` returns `Point[][]` — an array of strokes, each of
          // which is itself a list of points. Require at least one stroke
          // containing 3+ points.
          const data = sig.toData() as unknown as Array<ArrayLike<unknown>>
          if (!data.length || data.every((stroke) => (stroke?.length ?? 0) < 3)) {
            return null
          }

          return sig.toDataURL("image/png")
        },
        clear: () => {
          canvasRef.current?.clear()
          onChange?.(true)
        },
      }),
      [onChange],
    )

    function handleClear() {
      canvasRef.current?.clear()
      onChange?.(true)
    }

    return (
      <div className="rounded-md border bg-background" data-testid="signature-pad">
        <SignatureCanvas
          ref={(instance) => {
            canvasRef.current = instance
          }}
          canvasProps={{
            width,
            height,
            className: "w-full touch-none",
            "aria-label": "Signatur-Zeichenfläche",
          }}
          penColor="black"
          backgroundColor="white"
          onEnd={() => {
            onChange?.(canvasRef.current?.isEmpty() ?? true)
          }}
        />
        <div className="border-t p-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={handleClear}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Signatur löschen
          </Button>
        </div>
      </div>
    )
  },
)

SignaturePad.displayName = "SignaturePad"

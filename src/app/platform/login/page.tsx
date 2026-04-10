"use client"

/**
 * Platform-admin login page.
 *
 * Matches the visual language of the tenant login at
 * `src/app/[locale]/(auth)/login/page.tsx`: centered "T" logo, card
 * container, small footer copy. The flow itself is different — email +
 * password → MFA enrollment or verification → dashboard — driven by a
 * small local state machine.
 *
 * On successful MFA steps the server sets the `platform-session` cookie
 * via the tRPC response headers; the client just routes to
 * `/platform/dashboard`. The password step never sets a session cookie.
 */
import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import QRCode from "qrcode"
import { toast } from "sonner"
import { TRPCClientError } from "@trpc/client"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

type Step =
  | { kind: "password" }
  | {
      kind: "mfa_enrollment"
      enrollmentToken: string
      secretBase32: string
      otpauthUri: string
    }
  | { kind: "mfa_enrollment_codes"; recoveryCodes: string[] }
  | { kind: "mfa_verify"; challengeToken: string }

function formatErrorMessage(err: unknown): string {
  if (err instanceof TRPCClientError) {
    const code = err.data?.code as string | undefined
    if (code === "TOO_MANY_REQUESTS") {
      return "Zu viele Fehlversuche — bitte in ~15 Minuten erneut versuchen."
    }
    if (code === "FORBIDDEN") {
      return "Dieses Konto ist deaktiviert."
    }
    return err.message
  }
  return "Unerwarteter Fehler."
}

function ReasonBanner() {
  const params = useSearchParams()
  const reason = params.get("reason")
  if (!reason) return null
  const text =
    reason === "idle_timeout"
      ? "Sitzung wegen Inaktivität beendet. Bitte erneut anmelden."
      : reason === "session"
        ? "Sitzung abgelaufen. Bitte erneut anmelden."
        : reason === "logout"
          ? "Sie wurden abgemeldet."
          : null
  if (!text) return null
  return (
    <p className="rounded-md bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
      {text}
    </p>
  )
}

function PlatformLoginContent() {
  const router = useRouter()
  const trpc = usePlatformTRPC()

  const [step, setStep] = useState<Step>({ kind: "password" })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [totp, setTotp] = useState("")
  const [useRecovery, setUseRecovery] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState("")
  const [codesAcknowledged, setCodesAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const passwordStepMut = useMutation({
    ...trpc.auth.passwordStep.mutationOptions(),
    onSuccess: (result) => {
      if (!result) return
      setError(null)
      if (result.status === "mfa_enrollment_required") {
        setStep({
          kind: "mfa_enrollment",
          enrollmentToken: result.enrollmentToken,
          secretBase32: result.secretBase32,
          otpauthUri: result.otpauthUri,
        })
      } else {
        setStep({
          kind: "mfa_verify",
          challengeToken: result.challengeToken,
        })
      }
      setTotp("")
    },
    onError: (err) => {
      const msg = formatErrorMessage(err)
      setError(msg)
      toast.error(msg)
    },
  })

  const mfaEnrollMut = useMutation({
    ...trpc.auth.mfaEnroll.mutationOptions(),
    onSuccess: (result) => {
      if (!result) return
      setError(null)
      setStep({
        kind: "mfa_enrollment_codes",
        recoveryCodes: result.recoveryCodes,
      })
    },
    onError: (err) => {
      const msg = formatErrorMessage(err)
      setError(msg)
      toast.error(msg)
    },
  })

  const mfaVerifyMut = useMutation({
    ...trpc.auth.mfaVerify.mutationOptions(),
    onSuccess: () => {
      setError(null)
      router.push("/platform/dashboard")
    },
    onError: (err) => {
      const msg = formatErrorMessage(err)
      setError(msg)
      toast.error(msg)
    },
  })

  useEffect(() => {
    if (step.kind !== "mfa_enrollment") {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(step.otpauthUri, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch((err) => {
        console.error("[platform-login] QR render failed", err)
      })
    return () => {
      cancelled = true
    }
  }, [step])

  const isSubmittingPassword = passwordStepMut.isPending
  const isSubmittingMfa = mfaEnrollMut.isPending || mfaVerifyMut.isPending
  const canSubmitPassword = useMemo(
    () => email.trim().length > 0 && password.length > 0,
    [email, password]
  )
  const canSubmitTotp = totp.length === 6

  // ---- step bodies ----

  function renderPassword() {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSubmitPassword) return
          setError(null)
          passwordStepMut.mutate({ email: email.trim(), password })
        }}
      >
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            E-Mail
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            enterKeyHint="next"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmittingPassword}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Passwort
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              enterKeyHint="go"
              required
              className="pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmittingPassword}
            />
            <button
              type="button"
              className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={
                showPassword ? "Passwort verbergen" : "Passwort anzeigen"
              }
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="min-h-12 w-full"
          disabled={!canSubmitPassword || isSubmittingPassword}
        >
          {isSubmittingPassword && <Loader2 className="size-4 animate-spin" />}
          {isSubmittingPassword ? "Wird geprüft…" : "Weiter"}
        </Button>
      </form>
    )
  }

  function renderMfaEnrollment(
    current: Extract<Step, { kind: "mfa_enrollment" }>
  ) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSubmitTotp) return
          setError(null)
          mfaEnrollMut.mutate({
            enrollmentToken: current.enrollmentToken,
            token: totp,
          })
        }}
      >
        <p className="text-sm text-muted-foreground">
          Scannen Sie diesen QR-Code mit einer Authenticator-App
          (z.&nbsp;B. 1Password, Authy, Google Authenticator) und geben Sie
          den ersten generierten 6-stelligen Code ein.
        </p>
        <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/40 p-4">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="TOTP QR-Code"
              className="h-[220px] w-[220px]"
            />
          ) : (
            <div className="h-[220px] w-[220px] animate-pulse rounded bg-muted" />
          )}
          <code className="break-all rounded bg-background px-2 py-1 text-xs">
            {current.secretBase32}
          </code>
        </div>
        <div className="space-y-2">
          <label htmlFor="totp-enroll" className="text-sm font-medium">
            6-stelliger Code
          </label>
          <Input
            id="totp-enroll"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
            disabled={isSubmittingMfa}
          />
        </div>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="min-h-12 w-full"
          disabled={!canSubmitTotp || isSubmittingMfa}
        >
          {isSubmittingMfa && <Loader2 className="size-4 animate-spin" />}
          {isSubmittingMfa ? "Wird geprüft…" : "MFA aktivieren"}
        </Button>
      </form>
    )
  }

  function renderRecoveryCodes(
    current: Extract<Step, { kind: "mfa_enrollment_codes" }>
  ) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Bitte speichern Sie diese Wiederherstellungs-Codes an einem
          sicheren Ort. Sie werden <strong>nur einmal</strong> angezeigt
          und ermöglichen die Anmeldung, falls Sie Ihren Authenticator
          verlieren. Jeder Code kann nur einmal verwendet werden.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-4 font-mono text-sm">
          {current.recoveryCodes.map((code) => (
            <code key={code} className="rounded bg-background px-2 py-1">
              {code}
            </code>
          ))}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={codesAcknowledged}
            onCheckedChange={(v) => setCodesAcknowledged(v === true)}
          />
          <span>Ich habe diese Codes sicher gespeichert.</span>
        </label>
        <Button
          className="min-h-12 w-full"
          disabled={!codesAcknowledged}
          onClick={() => router.push("/platform/dashboard")}
        >
          Zum Dashboard
        </Button>
      </div>
    )
  }

  function renderMfaVerify(current: Extract<Step, { kind: "mfa_verify" }>) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          if (useRecovery) {
            if (recoveryCode.trim().length === 0) return
            mfaVerifyMut.mutate({
              challengeToken: current.challengeToken,
              recoveryCode: recoveryCode.trim(),
            })
          } else {
            if (!canSubmitTotp) return
            mfaVerifyMut.mutate({
              challengeToken: current.challengeToken,
              token: totp,
            })
          }
        }}
      >
        {!useRecovery ? (
          <div className="space-y-2">
            <label htmlFor="totp-verify" className="text-sm font-medium">
              6-stelliger Code
            </label>
            <Input
              id="totp-verify"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
              disabled={isSubmittingMfa}
              autoFocus
            />
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="recovery-code" className="text-sm font-medium">
              Wiederherstellungs-Code
            </label>
            <Input
              id="recovery-code"
              autoComplete="one-time-code"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              disabled={isSubmittingMfa}
              autoFocus
            />
          </div>
        )}
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="min-h-12 w-full"
          disabled={
            isSubmittingMfa ||
            (useRecovery ? recoveryCode.trim().length === 0 : !canSubmitTotp)
          }
        >
          {isSubmittingMfa && <Loader2 className="size-4 animate-spin" />}
          {isSubmittingMfa ? "Wird geprüft…" : "Anmelden"}
        </Button>
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground hover:underline"
          onClick={() => {
            setUseRecovery((v) => !v)
            setTotp("")
            setRecoveryCode("")
            setError(null)
          }}
        >
          {useRecovery
            ? "Stattdessen Authenticator-Code verwenden"
            : "Stattdessen Wiederherstellungs-Code verwenden"}
        </button>
      </form>
    )
  }

  const subtitle =
    step.kind === "password"
      ? "Melden Sie sich als Plattform-Administrator an."
      : step.kind === "mfa_enrollment"
        ? "Erste Einrichtung der Zwei-Faktor-Authentifizierung."
        : step.kind === "mfa_enrollment_codes"
          ? "Bewahren Sie diese Codes sicher auf."
          : "Geben Sie den Code aus Ihrer Authenticator-App ein."

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="text-2xl font-bold">T</span>
        </div>
        <h1 className="text-2xl font-bold">Terp Platform</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <ReasonBanner />

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        {step.kind === "password" && renderPassword()}
        {step.kind === "mfa_enrollment" && renderMfaEnrollment(step)}
        {step.kind === "mfa_enrollment_codes" && renderRecoveryCodes(step)}
        {step.kind === "mfa_verify" && renderMfaVerify(step)}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Nur für autorisiertes Plattform-Personal.
      </p>
    </div>
  )
}

export default function PlatformLoginPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-muted/40 px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          }
        >
          <PlatformLoginContent />
        </Suspense>
      </div>
    </div>
  )
}

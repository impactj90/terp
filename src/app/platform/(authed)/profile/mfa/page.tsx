"use client"

/**
 * Platform profile — MFA status.
 *
 * Minimal view: shows whether MFA is enrolled, when it was enrolled, and
 * last login info. Re-enrollment is not self-service — a peer operator
 * resets MFA via the platform-users page, after which the next login
 * walks the operator through enrollment again.
 */
import { useQuery } from "@tanstack/react-query"
import { ShieldCheck, ShieldAlert } from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default function PlatformProfileMfaPage() {
  const trpc = usePlatformTRPC()
  const meQuery = useQuery(trpc.auth.me.queryOptions())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profil &amp; MFA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Übersicht Ihres Plattform-Operator-Kontos.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Konto</CardTitle>
          <CardDescription>Stammdaten des aktuellen Operators.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {meQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : meQuery.data ? (
            <div className="grid grid-cols-[160px_1fr] gap-2">
              <span className="text-muted-foreground">Name</span>
              <span>{meQuery.data.displayName}</span>
              <span className="text-muted-foreground">E-Mail</span>
              <span>{meQuery.data.email}</span>
              <span className="text-muted-foreground">Angelegt</span>
              <span>{formatDateTime(meQuery.data.createdAt)}</span>
              <span className="text-muted-foreground">Letzter Login</span>
              <span>{formatDateTime(meQuery.data.lastLoginAt)}</span>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Operator-Daten konnten nicht geladen werden.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Multi-Faktor-Authentifizierung</CardTitle>
          <CardDescription>
            Alle Operator-Konten müssen MFA verwenden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {meQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : meQuery.data?.mfaEnrolledAt ? (
            <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-3">
              <ShieldCheck className="size-5 text-emerald-600" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">MFA aktiviert</span>
                  <Badge variant="secondary">TOTP</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Eingerichtet am {formatDateTime(meQuery.data.mfaEnrolledAt)}.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-md border bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
              <ShieldAlert className="size-5" />
              <div>
                <div className="font-medium">MFA nicht eingerichtet</div>
                <p className="text-xs">
                  MFA wird beim nächsten Login erzwungen.
                </p>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Um MFA neu einzurichten, bitten Sie einen anderen Operator,
            Ihren MFA-Eintrag unter <em>Platform-Users</em> zurückzusetzen.
            Beim nächsten Login werden Sie dann erneut durch die Einrichtung
            geführt.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

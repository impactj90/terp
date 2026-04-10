"use client"

/**
 * Platform tenants list.
 *
 * Read-only directory — tenant creation and lifecycle mutations live in
 * Phase 9. "Request access template" is a clipboard helper that prints a
 * short email / chat block an operator can send to a tenant admin asking
 * them to initiate a support session (sessions are tenant-initiated; the
 * operator never creates them on their own).
 */
import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Search, Copy } from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"

function buildAccessTemplate(tenantName: string): string {
  return [
    `Guten Tag,`,
    ``,
    `um Ihnen bei Ihrer Anfrage im Terp-Mandanten "${tenantName}" zu helfen,`,
    `benötigen wir temporären Lesezugriff auf Ihr System.`,
    ``,
    `Bitte öffnen Sie dazu in Terp unter "Einstellungen > Support-Zugriff"`,
    `eine neue Support-Session und senden uns die Bestätigungs-ID zurück.`,
    ``,
    `Vielen Dank.`,
  ].join("\n")
}

export default function PlatformTenantsPage() {
  const trpc = usePlatformTRPC()
  const [query, setQuery] = useState("")
  const [includeInactive, setIncludeInactive] = useState(false)

  const tenantsQuery = useQuery(
    trpc.tenants.list.queryOptions({
      q: query.trim() || undefined,
      includeInactive,
    })
  )

  async function copyTemplate(tenantName: string) {
    const text = buildAccessTemplate(tenantName)
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Vorlage in Zwischenablage kopiert")
    } catch {
      toast.error("Kopieren fehlgeschlagen")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tenants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verzeichnis aller Mandanten. Support-Sessions sind Tenant-initiiert.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suche</CardTitle>
          <CardDescription>
            Suche nach Name oder Slug. Maximal 100 Ergebnisse.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name oder Slug…"
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(v) => setIncludeInactive(v === true)}
            />
            Inaktive anzeigen
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ergebnisse</CardTitle>
        </CardHeader>
        <CardContent>
          {tenantsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (tenantsQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Tenants gefunden.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantsQuery.data!.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link
                        href={`/platform/tenants/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {t.slug}
                    </TableCell>
                    <TableCell>
                      {t.isActive ? (
                        <Badge variant="secondary">Aktiv</Badge>
                      ) : (
                        <Badge variant="outline">Inaktiv</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyTemplate(t.name)}
                      >
                        <Copy className="mr-1 size-3" />
                        Zugriffsanfrage-Vorlage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

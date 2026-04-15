"use client"

/**
 * Create-tenant form (Phase 9).
 *
 * Posts to `tenantManagement.create` which creates the tenant row, the
 * initial admin user, and triggers the welcome email. If SMTP is missing
 * or the send fails, the returned `inviteLink` is shown in a copyable
 * dialog so the operator can hand it over to the customer manually.
 */
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Copy, Check } from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
import { isValidIban } from "@/lib/sepa/iban-validator"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const GERMAN_STATES: Array<{ code: string; label: string }> = [
  { code: "BW", label: "Baden-Württemberg" },
  { code: "BY", label: "Bayern" },
  { code: "BE", label: "Berlin" },
  { code: "BB", label: "Brandenburg" },
  { code: "HB", label: "Bremen" },
  { code: "HH", label: "Hamburg" },
  { code: "HE", label: "Hessen" },
  { code: "MV", label: "Mecklenburg-Vorpommern" },
  { code: "NI", label: "Niedersachsen" },
  { code: "NW", label: "Nordrhein-Westfalen" },
  { code: "RP", label: "Rheinland-Pfalz" },
  { code: "SL", label: "Saarland" },
  { code: "SN", label: "Sachsen" },
  { code: "ST", label: "Sachsen-Anhalt" },
  { code: "SH", label: "Schleswig-Holstein" },
  { code: "TH", label: "Thüringen" },
]

const INDUSTRY_LABELS: Record<string, string> = {
  industriedienstleister: "Industriedienstleister",
}

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

export default function PlatformNewTenantPage() {
  const trpc = usePlatformTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [contactEmail, setContactEmail] = useState("")
  const [initialAdminEmail, setInitialAdminEmail] = useState("")
  const [initialAdminDisplayName, setInitialAdminDisplayName] = useState("")
  const [addressStreet, setAddressStreet] = useState("")
  const [addressZip, setAddressZip] = useState("")
  const [addressCity, setAddressCity] = useState("")
  const [addressCountry, setAddressCountry] = useState("Deutschland")
  const [billingExempt, setBillingExempt] = useState(false)

  // Phase 7: tenant-template toggle and per-instance fields.
  const [useTemplate, setUseTemplate] = useState(false)
  const [templateKey, setTemplateKey] = useState<string>("")
  const [legalName, setLegalName] = useState("")
  const [legalNameTouched, setLegalNameTouched] = useState(false)
  const [iban, setIban] = useState("")
  const [ibanBlurred, setIbanBlurred] = useState(false)
  const [bic, setBic] = useState("")
  const [taxId, setTaxId] = useState("")
  const [leitwegId, setLeitwegId] = useState("")
  const [holidayState, setHolidayState] = useState<string>("")
  const [defaultLocationName, setDefaultLocationName] = useState("Hauptsitz")

  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  // Auto-prefill legal name from company name when template toggle is on and
  // the operator hasn't manually edited it yet.
  useEffect(() => {
    if (useTemplate && !legalNameTouched) setLegalName(name)
  }, [useTemplate, name, legalNameTouched])

  const starterTemplatesQuery = useQuery({
    ...trpc.tenantManagement.starterTemplates.queryOptions(),
    enabled: useTemplate,
  })
  const starterTemplates = starterTemplatesQuery.data ?? []

  const templatesByIndustry = useMemo(() => {
    const map = new Map<string, typeof starterTemplates>()
    for (const t of starterTemplates) {
      const existing = map.get(t.industry) ?? []
      existing.push(t)
      map.set(t.industry, existing)
    }
    return Array.from(map.entries())
  }, [starterTemplates])

  const ibanInvalid =
    useTemplate && ibanBlurred && iban.trim().length > 0 && !isValidIban(iban)

  function handleSuccess(data: {
    tenant: { id: string }
    inviteLink: string | null
  }) {
    queryClient.invalidateQueries({
      queryKey: trpc.tenantManagement.list.queryKey(),
    })
    if (data.inviteLink) {
      toast.success("Tenant angelegt — bitte Einladungslink manuell weitergeben")
      setInviteLink(data.inviteLink)
      setCreatedTenantId(data.tenant.id)
    } else {
      toast.success("Tenant angelegt und Willkommens-E-Mail versendet")
      router.push(`/platform/tenants/${data.tenant.id}`)
    }
  }

  const createMutation = useMutation({
    ...trpc.tenantManagement.create.mutationOptions(),
    onSuccess: handleSuccess,
    onError: (err) => toast.error(err.message ?? "Anlegen fehlgeschlagen"),
  })

  const createFromTemplateMutation = useMutation({
    ...trpc.tenantManagement.createFromTemplate.mutationOptions(),
    onSuccess: handleSuccess,
    onError: (err) => toast.error(err.message ?? "Anlegen fehlgeschlagen"),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const baseInput = {
      name: name.trim(),
      slug: slug.trim(),
      contactEmail: contactEmail.trim(),
      initialAdminEmail: initialAdminEmail.trim(),
      initialAdminDisplayName: initialAdminDisplayName.trim(),
      addressStreet: addressStreet.trim(),
      addressZip: addressZip.trim(),
      addressCity: addressCity.trim(),
      addressCountry: addressCountry.trim(),
      billingExempt,
    }

    if (!useTemplate) {
      createMutation.mutate(baseInput)
      return
    }

    if (!templateKey) {
      toast.error("Bitte ein Branchen-Template wählen")
      return
    }
    if (!holidayState) {
      toast.error("Bitte ein Bundesland wählen")
      return
    }
    if (!isValidIban(iban)) {
      setIbanBlurred(true)
      toast.error("Ungültige IBAN")
      return
    }

    createFromTemplateMutation.mutate({
      ...baseInput,
      templateKey,
      billingConfig: {
        legalName: legalName.trim(),
        iban: iban.trim(),
        bic: bic.trim() ? bic.trim() : undefined,
        taxId: taxId.trim(),
        leitwegId: leitwegId.trim() ? leitwegId.trim() : undefined,
      },
      holidayState,
      defaultLocation: {
        name: defaultLocationName.trim() || "Hauptsitz",
        street: addressStreet.trim(),
        zip: addressZip.trim(),
        city: addressCity.trim(),
        country: addressCountry.trim(),
      },
    })
  }

  async function copyInviteLink() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Kopieren fehlgeschlagen")
    }
  }

  const isSubmitting =
    createMutation.isPending || createFromTemplateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/platform/tenants">
            <ArrowLeft className="mr-1 size-4" />
            Zurück
          </Link>
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Neuer Tenant</CardTitle>
              <CardDescription>
                Legt einen neuen Mandanten und den initialen Administrator an.
                Der Admin erhält eine Willkommens-E-Mail mit Setup-Link.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Firmenname</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  placeholder="Muster GmbH"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value)
                    setSlugTouched(true)
                  }}
                  required
                  pattern="[a-z0-9\\-]+"
                  placeholder="muster-gmbh"
                />
                <p className="text-xs text-muted-foreground">
                  Nur Kleinbuchstaben, Ziffern, Bindestriche.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="contactEmail">Kontakt-E-Mail (Firma)</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                  placeholder="info@muster-gmbh.de"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Adresse</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="street">Straße &amp; Hausnummer</Label>
                <Input
                  id="street"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">PLZ</Label>
                <Input
                  id="zip"
                  value={addressZip}
                  onChange={(e) => setAddressZip(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ort</Label>
                <Input
                  id="city"
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="country">Land</Label>
                <Input
                  id="country"
                  value={addressCountry}
                  onChange={(e) => setAddressCountry(e.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Initialer Administrator</CardTitle>
              <CardDescription>
                Dieser Benutzer erhält Admin-Rechte im neuen Tenant und bekommt
                einen Setup-Link per E-Mail.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="adminEmail">E-Mail</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  value={initialAdminEmail}
                  onChange={(e) => setInitialAdminEmail(e.target.value)}
                  required
                  placeholder="admin@muster-gmbh.de"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminName">Anzeigename</Label>
                <Input
                  id="adminName"
                  value={initialAdminDisplayName}
                  onChange={(e) => setInitialAdminDisplayName(e.target.value)}
                  required
                  minLength={2}
                  placeholder="Max Mustermann"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Abrechnung</CardTitle>
              <CardDescription>
                Steuert, ob dieser Tenant automatisch fakturiert wird.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label
                htmlFor="billingExempt"
                className="flex cursor-pointer items-start gap-3"
              >
                <Checkbox
                  id="billingExempt"
                  checked={!billingExempt}
                  onCheckedChange={(v) => setBillingExempt(!v)}
                />
                <div className="space-y-1">
                  <div className="font-medium">Automatische Fakturierung</div>
                  <p className="text-sm text-muted-foreground">
                    Deaktivieren für Vertriebspartner und Sonderkunden, die die
                    Applikation nutzen, aber nicht bezahlen. Die CRM-Adresse wird
                    trotzdem beim ersten Modul angelegt; es werden aber keine
                    automatischen Abos und Rechnungen erzeugt. Manuelle Rechnungen
                    auf die CRM-Adresse bleiben jederzeit möglich.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Branchen-Template (optional)</CardTitle>
              <CardDescription>
                Aktivieren, um den neuen Tenant mit einer vorkonfigurierten
                Stammdaten-Ebene zu starten (Tarife, Schichtmodelle, Feiertage,
                Mahn-Templates).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label
                htmlFor="useTemplate"
                className="flex cursor-pointer items-start gap-3"
              >
                <Checkbox
                  id="useTemplate"
                  checked={useTemplate}
                  onCheckedChange={(v) => setUseTemplate(Boolean(v))}
                />
                <div className="space-y-1">
                  <div className="font-medium">Mit Branchen-Template starten</div>
                  <p className="text-sm text-muted-foreground">
                    Wenn deaktiviert, wird ein leerer Tenant angelegt — ohne
                    Tarife, Abteilungen oder Mahn-Templates.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          {useTemplate && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Branche &amp; Variante</CardTitle>
                  <CardDescription>
                    Wählt das Branchen-Template, das die Stammdaten-Ebene
                    seedet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Select value={templateKey} onValueChange={setTemplateKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="Branchen-Template wählen…" />
                    </SelectTrigger>
                    <SelectContent>
                      {templatesByIndustry.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          {starterTemplatesQuery.isLoading
                            ? "Lade Templates…"
                            : "Keine Templates verfügbar"}
                        </div>
                      )}
                      {templatesByIndustry.map(([industry, templates]) => (
                        <SelectGroup key={industry}>
                          <SelectLabel>
                            {INDUSTRY_LABELS[industry] ?? industry}
                          </SelectLabel>
                          {templates.map((t) => (
                            <SelectItem key={t.key} value={t.key}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Firmen-Stammdaten</CardTitle>
                  <CardDescription>
                    Werden in den Briefkopf von Rechnungen und in das
                    XRechnung-Format geschrieben.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="legalName">Rechtlicher Firmenname</Label>
                    <Input
                      id="legalName"
                      value={legalName}
                      onChange={(e) => {
                        setLegalName(e.target.value)
                        setLegalNameTouched(true)
                      }}
                      required={useTemplate}
                      placeholder="Muster GmbH"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxId">Steuernummer / USt-IdNr.</Label>
                    <Input
                      id="taxId"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      required={useTemplate}
                      placeholder="DE123456789"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="leitwegId">Leitweg-ID (optional)</Label>
                    <Input
                      id="leitwegId"
                      value={leitwegId}
                      onChange={(e) => setLeitwegId(e.target.value)}
                      placeholder="99001-12345-67"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="iban">IBAN</Label>
                    <Input
                      id="iban"
                      value={iban}
                      onChange={(e) => setIban(e.target.value)}
                      onBlur={() => setIbanBlurred(true)}
                      required={useTemplate}
                      placeholder="DE00 0000 0000 0000 0000 00"
                      aria-invalid={ibanInvalid || undefined}
                    />
                    {ibanInvalid && (
                      <p className="text-xs text-destructive">
                        IBAN ist ungültig (Prüfziffer stimmt nicht).
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bic">BIC (optional)</Label>
                    <Input
                      id="bic"
                      value={bic}
                      onChange={(e) => setBic(e.target.value)}
                      placeholder="DEUTDEFFXXX"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Standort &amp; Feiertage</CardTitle>
                  <CardDescription>
                    Der Default-Standort übernimmt die Adresse aus der Karte
                    „Adresse" oben. Das Bundesland bestimmt, welche Feiertage
                    für das laufende und das nächste Jahr generiert werden.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="defaultLocationName">
                      Standort-Bezeichnung
                    </Label>
                    <Input
                      id="defaultLocationName"
                      value={defaultLocationName}
                      onChange={(e) =>
                        setDefaultLocationName(e.target.value)
                      }
                      required={useTemplate}
                      placeholder="Hauptsitz"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="holidayState">Bundesland</Label>
                    <Select
                      value={holidayState}
                      onValueChange={setHolidayState}
                    >
                      <SelectTrigger id="holidayState">
                        <SelectValue placeholder="Bundesland wählen…" />
                      </SelectTrigger>
                      <SelectContent>
                        {GERMAN_STATES.map((s) => (
                          <SelectItem key={s.code} value={s.code}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Hinweis: SMTP-Konfiguration</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    SMTP-Zugangsdaten pflegt der Kunden-Admin nach dem ersten
                    Login im Bereich Administration → E-Mail-Versand. Ohne
                    SMTP-Konfiguration kann der Tenant keine E-Mails versenden.
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button asChild variant="ghost" disabled={isSubmitting}>
              <Link href="/platform/tenants">Abbrechen</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Wird angelegt…" : "Tenant anlegen"}
            </Button>
          </div>
        </div>
      </form>

      <Dialog
        open={inviteLink !== null}
        onOpenChange={(open) => {
          if (!open) {
            setInviteLink(null)
            if (createdTenantId) {
              router.push(`/platform/tenants/${createdTenantId}`)
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Einladungslink manuell weitergeben</DialogTitle>
            <DialogDescription>
              Die Willkommens-E-Mail konnte nicht automatisch versendet werden
              (SMTP fehlt oder Zustellung fehlgeschlagen). Bitte kopiere den
              folgenden Link und sende ihn dem neuen Administrator manuell:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Setup-Link</Label>
            <div className="flex gap-2">
              <Input readOnly value={inviteLink ?? ""} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyInviteLink}
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
            <Button
              onClick={() => {
                if (createdTenantId) {
                  router.push(`/platform/tenants/${createdTenantId}`)
                }
              }}
            >
              Fertig
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

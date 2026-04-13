"use client"

/**
 * Create-tenant form (Phase 9).
 *
 * Posts to `tenantManagement.create` which creates the tenant row, the
 * initial admin user, and triggers the welcome email. If SMTP is missing
 * or the send fails, the returned `inviteLink` is shown in a copyable
 * dialog so the operator can hand it over to the customer manually.
 */
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Copy, Check } from "lucide-react"
import { usePlatformTRPC } from "@/trpc/platform/context"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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

  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  const createMutation = useMutation({
    ...trpc.tenantManagement.create.mutationOptions(),
    onSuccess: (data) => {
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
    },
    onError: (err) => toast.error(err.message ?? "Anlegen fehlgeschlagen"),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    createMutation.mutate({
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

  const isSubmitting = createMutation.isPending

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

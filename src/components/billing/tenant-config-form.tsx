'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { useBillingTenantConfig, useUpsertBillingTenantConfig } from '@/hooks'
import { toast } from 'sonner'

export function TenantConfigForm() {
  const { data: config, isLoading } = useBillingTenantConfig()
  const upsertMutation = useUpsertBillingTenantConfig()

  const [companyName, setCompanyName] = React.useState('')
  const [companyAddress, setCompanyAddress] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [website, setWebsite] = React.useState('')
  const [bankName, setBankName] = React.useState('')
  const [iban, setIban] = React.useState('')
  const [bic, setBic] = React.useState('')
  const [taxId, setTaxId] = React.useState('')
  const [commercialRegister, setCommercialRegister] = React.useState('')
  const [managingDirector, setManagingDirector] = React.useState('')
  const [footerHtml, setFooterHtml] = React.useState('')
  const [taxNumber, setTaxNumber] = React.useState('')
  const [leitwegId, setLeitwegId] = React.useState('')
  const [eInvoiceEnabled, setEInvoiceEnabled] = React.useState(false)
  const [companyStreet, setCompanyStreet] = React.useState('')
  const [companyZip, setCompanyZip] = React.useState('')
  const [companyCity, setCompanyCity] = React.useState('')
  const [companyCountry, setCompanyCountry] = React.useState('DE')

  // Load existing config
  React.useEffect(() => {
    if (config) {
      setCompanyName(config.companyName ?? '')
      setCompanyAddress(config.companyAddress ?? '')
      setPhone(config.phone ?? '')
      setEmail(config.email ?? '')
      setWebsite(config.website ?? '')
      setBankName(config.bankName ?? '')
      setIban(config.iban ?? '')
      setBic(config.bic ?? '')
      setTaxId(config.taxId ?? '')
      setCommercialRegister(config.commercialRegister ?? '')
      setManagingDirector(config.managingDirector ?? '')
      setFooterHtml(config.footerHtml ?? '')
      setTaxNumber(config.taxNumber ?? '')
      setLeitwegId(config.leitwegId ?? '')
      setEInvoiceEnabled(config.eInvoiceEnabled ?? false)
      setCompanyStreet(config.companyStreet ?? '')
      setCompanyZip(config.companyZip ?? '')
      setCompanyCity(config.companyCity ?? '')
      setCompanyCountry(config.companyCountry ?? 'DE')
    }
  }, [config])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await upsertMutation.mutateAsync({
        companyName: companyName || null,
        companyAddress: companyAddress || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
        bankName: bankName || null,
        iban: iban || null,
        bic: bic || null,
        taxId: taxId || null,
        commercialRegister: commercialRegister || null,
        managingDirector: managingDirector || null,
        footerHtml: footerHtml || null,
        taxNumber: taxNumber || null,
        leitwegId: leitwegId || null,
        eInvoiceEnabled,
        companyStreet: companyStreet || null,
        companyZip: companyZip || null,
        companyCity: companyCity || null,
        companyCountry: companyCountry || null,
      })
      toast.success('Briefpapier gespeichert')
    } catch {
      toast.error('Fehler beim Speichern')
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground text-center py-8">Laden...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Briefpapier / Billing-Konfiguration</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Unternehmen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Unternehmen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Firmenname</Label>
              <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Muster GmbH" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-address">Adresse</Label>
              <Textarea id="company-address" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="Musterstraße 1&#10;12345 Musterstadt" rows={3} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+49 123 456789" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-field">E-Mail</Label>
                <Input id="email-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@firma.de" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website-field">Website</Label>
                <Input id="website-field" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://firma.de" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bankverbindung */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bankverbindung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bank-name">Bankname</Label>
              <Input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Sparkasse Musterstadt" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="iban">IBAN</Label>
                <Input id="iban" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE89 3704 0044 0532 0130 00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bic">BIC</Label>
                <Input id="bic" value={bic} onChange={(e) => setBic(e.target.value)} placeholder="COBADEFFXXX" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rechtliches */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rechtliches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tax-id">USt-IdNr.</Label>
                <Input id="tax-id" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="DE123456789" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-register">Handelsregister</Label>
                <Input id="commercial-register" value={commercialRegister} onChange={(e) => setCommercialRegister(e.target.value)} placeholder="HRB 12345" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="managing-director">Geschäftsführer</Label>
                <Input id="managing-director" value={managingDirector} onChange={(e) => setManagingDirector(e.target.value)} placeholder="Max Mustermann" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* E-Rechnung */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">E-Rechnung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                id="e-invoice-enabled"
                checked={eInvoiceEnabled}
                onCheckedChange={setEInvoiceEnabled}
              />
              <Label htmlFor="e-invoice-enabled">E-Rechnung aktivieren (ZUGFeRD / XRechnung)</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Wenn aktiviert, wird bei Rechnungen und Gutschriften automatisch eine EN 16931 konforme E-Rechnung (CII-XML) erstellt und in das PDF eingebettet.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tax-number">Steuernummer</Label>
                <Input id="tax-number" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="123/456/78901" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leitweg-id">Leitweg-ID</Label>
                <Input id="leitweg-id" value={leitwegId} onChange={(e) => setLeitwegId(e.target.value)} placeholder="991-12345-67" />
                <p className="text-xs text-muted-foreground">Für XRechnung an öffentliche Auftraggeber</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Strukturierte Firmenadresse (für E-Rechnung)</Label>
              <p className="text-xs text-muted-foreground">
                Diese Felder werden für das maschinenlesbare XML verwendet. Die Freitext-Adresse oben bleibt für den PDF-Briefkopf.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-street">Straße</Label>
              <Input id="company-street" value={companyStreet} onChange={(e) => setCompanyStreet(e.target.value)} placeholder="Musterstraße 1" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company-zip">PLZ</Label>
                <Input id="company-zip" value={companyZip} onChange={(e) => setCompanyZip(e.target.value)} placeholder="12345" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-city">Ort</Label>
                <Input id="company-city" value={companyCity} onChange={(e) => setCompanyCity(e.target.value)} placeholder="Musterstadt" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company-country">Land</Label>
                <Input id="company-country" value={companyCountry} onChange={(e) => setCompanyCountry(e.target.value)} placeholder="DE" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fußzeile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Fußzeile (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Benutzerdefinierter Fußzeilentext. Wenn leer, wird die Fußzeile automatisch aus den obigen Feldern generiert.
            </p>
            <div className="border rounded-md p-2 min-h-[80px]">
              <RichTextEditor
                content={footerHtml}
                onUpdate={setFooterHtml}
                placeholder="Benutzerdefinierte Fußzeile..."
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={upsertMutation.isPending}>
            {upsertMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Speichern
          </Button>
        </div>
      </form>
    </div>
  )
}

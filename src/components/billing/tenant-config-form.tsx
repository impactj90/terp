'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
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

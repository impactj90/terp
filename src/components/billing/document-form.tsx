'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCreateBillingDocument } from '@/hooks'
import { useCrmAddresses } from '@/hooks'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'

const DOCUMENT_TYPES = [
  { value: 'OFFER', label: 'Angebot' },
  { value: 'ORDER_CONFIRMATION', label: 'Auftragsbestätigung' },
  { value: 'DELIVERY_NOTE', label: 'Lieferschein' },
  { value: 'SERVICE_NOTE', label: 'Leistungsschein' },
  { value: 'RETURN_DELIVERY', label: 'Rücklieferung' },
  { value: 'INVOICE', label: 'Rechnung' },
  { value: 'CREDIT_NOTE', label: 'Gutschrift' },
]

export function BillingDocumentForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const createMutation = useCreateBillingDocument()

  const [type, setType] = React.useState(searchParams.get('type') ?? 'OFFER')
  const [addressId, setAddressId] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [internalNotes, setInternalNotes] = React.useState('')
  const [paymentTermDays, setPaymentTermDays] = React.useState('')
  const [discountPercent, setDiscountPercent] = React.useState('')
  const [discountDays, setDiscountDays] = React.useState('')
  const [discountPercent2, setDiscountPercent2] = React.useState('')
  const [discountDays2, setDiscountDays2] = React.useState('')
  const [deliveryType, setDeliveryType] = React.useState('')
  const [deliveryTerms, setDeliveryTerms] = React.useState('')

  // Load addresses for selection
  const { data: addressData } = useCrmAddresses({ pageSize: 100 })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!addressId) {
      toast.error('Bitte wählen Sie eine Kundenadresse')
      return
    }

    try {
      const result = await createMutation.mutateAsync({
        type: type as "OFFER",
        addressId,
        notes: notes || undefined,
        internalNotes: internalNotes || undefined,
        paymentTermDays: paymentTermDays ? parseInt(paymentTermDays) : undefined,
        discountPercent: discountPercent ? parseFloat(discountPercent) : undefined,
        discountDays: discountDays ? parseInt(discountDays) : undefined,
        discountPercent2: discountPercent2 ? parseFloat(discountPercent2) : undefined,
        discountDays2: discountDays2 ? parseInt(discountDays2) : undefined,
        deliveryType: deliveryType || undefined,
        deliveryTerms: deliveryTerms || undefined,
      })
      toast.success('Beleg erfolgreich erstellt')
      if (result?.id) {
        router.push(`/orders/documents/${result.id}`)
      } else {
        router.push('/orders/documents')
      }
    } catch {
      toast.error('Fehler beim Erstellen des Belegs')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">Neuer Beleg</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Type and Customer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Kopfdaten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Belegtyp</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((dt) => (
                      <SelectItem key={dt.value} value={dt.value}>
                        {dt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressId">Kundenadresse *</Label>
                <Select value={addressId} onValueChange={setAddressId}>
                  <SelectTrigger id="addressId">
                    <SelectValue placeholder="Adresse wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {addressData?.items?.map((addr) => (
                      <SelectItem key={addr.id} value={addr.id}>
                        {addr.company} ({addr.number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Terms */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Konditionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentTermDays">Zahlungsziel (Tage)</Label>
                <Input
                  id="paymentTermDays"
                  type="number"
                  value={paymentTermDays}
                  onChange={(e) => setPaymentTermDays(e.target.value)}
                  placeholder="z.B. 30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountPercent">Skonto 1 %</Label>
                <Input
                  id="discountPercent"
                  type="number"
                  step="0.01"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="z.B. 3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountDays">Skonto 1 Tage</Label>
                <Input
                  id="discountDays"
                  type="number"
                  value={discountDays}
                  onChange={(e) => setDiscountDays(e.target.value)}
                  placeholder="z.B. 10"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div />
              <div className="space-y-2">
                <Label htmlFor="discountPercent2">Skonto 2 %</Label>
                <Input
                  id="discountPercent2"
                  type="number"
                  step="0.01"
                  value={discountPercent2}
                  onChange={(e) => setDiscountPercent2(e.target.value)}
                  placeholder="z.B. 2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountDays2">Skonto 2 Tage</Label>
                <Input
                  id="discountDays2"
                  type="number"
                  value={discountDays2}
                  onChange={(e) => setDiscountDays2(e.target.value)}
                  placeholder="z.B. 20"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deliveryType">Lieferart</Label>
                <Input
                  id="deliveryType"
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value)}
                  placeholder="z.B. Spedition"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deliveryTerms">Lieferbedingungen</Label>
                <Input
                  id="deliveryTerms"
                  value={deliveryTerms}
                  onChange={(e) => setDeliveryTerms(e.target.value)}
                  placeholder="z.B. frei Haus"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bemerkungen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Bemerkungen (extern)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Sichtbar für den Kunden..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="internalNotes">Interne Notizen</Label>
              <Textarea
                id="internalNotes"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Nur intern sichtbar..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Wird erstellt...' : 'Speichern'}
          </Button>
        </div>
      </form>
    </div>
  )
}

'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import {
  useCreateBillingServiceCase,
  useUpdateBillingServiceCase,
  useCrmAddresses,
  useCrmContacts,
  useEmployees,
} from '@/hooks'
import { toast } from 'sonner'

interface FormState {
  title: string
  addressId: string
  contactId: string
  description: string
  assignedToId: string
  customerNotifiedCost: boolean
}

const INITIAL_STATE: FormState = {
  title: '',
  addressId: '',
  contactId: '',
  description: '',
  assignedToId: '',
  customerNotifiedCost: false,
}

interface ServiceCaseFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId?: string
  editItem?: Record<string, unknown> | null
}

export function ServiceCaseFormSheet({
  open,
  onOpenChange,
  addressId: presetAddressId,
  editItem,
}: ServiceCaseFormSheetProps) {
  const isEdit = !!editItem
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState('')

  const createMutation = useCreateBillingServiceCase()
  const updateMutation = useUpdateBillingServiceCase()
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  const { data: addressData } = useCrmAddresses({ pageSize: 100 })
  const addresses = addressData?.items ?? []

  const selectedAddressId = form.addressId || presetAddressId || ''
  const { data: contacts } = useCrmContacts(selectedAddressId, !!selectedAddressId)
  const { data: employeeData } = useEmployees({ pageSize: 200 })
  const employees = employeeData?.items ?? []

  React.useEffect(() => {
    if (open) {
      if (editItem) {
        setForm({
          title: (editItem.title as string) || '',
          addressId: (editItem.addressId as string) || '',
          contactId: (editItem.contactId as string) || '',
          description: (editItem.description as string) || '',
          assignedToId: (editItem.assignedToId as string) || '',
          customerNotifiedCost: (editItem.customerNotifiedCost as boolean) || false,
        })
      } else {
        setForm({
          ...INITIAL_STATE,
          addressId: presetAddressId || '',
        })
      }
      setError('')
    }
  }, [open, editItem, presetAddressId])

  const handleClose = () => {
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('Titel ist ein Pflichtfeld')
      return
    }

    const resolvedAddressId = form.addressId || presetAddressId
    if (!resolvedAddressId) {
      setError('Kundenadresse ist ein Pflichtfeld')
      return
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: editItem!.id as string,
          title: form.title,
          contactId: form.contactId || null,
          description: form.description || null,
          assignedToId: form.assignedToId || null,
          customerNotifiedCost: form.customerNotifiedCost,
        })
        toast.success('Serviceauftrag aktualisiert')
      } else {
        await createMutation.mutateAsync({
          title: form.title,
          addressId: resolvedAddressId,
          ...(form.contactId ? { contactId: form.contactId } : {}),
          ...(form.description ? { description: form.description } : {}),
          ...(form.assignedToId ? { assignedToId: form.assignedToId } : {}),
          customerNotifiedCost: form.customerNotifiedCost,
        })
        toast.success('Serviceauftrag erstellt')
      }
      handleClose()
    } catch (err) {
      let message = 'Fehler beim Speichern'
      if (err instanceof Error) {
        // tRPC wraps Zod errors as JSON strings — show a friendly fallback
        try {
          JSON.parse(err.message)
          message = 'Ungültige Eingabe. Bitte prüfen Sie Ihre Angaben.'
        } catch {
          message = err.message
        }
      }
      setError(message)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Serviceauftrag bearbeiten' : 'Neuer Serviceauftrag'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="sc-title">Titel *</Label>
              <Input
                id="sc-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                disabled={isSubmitting}
                placeholder="z.B. Heizungsreparatur"
              />
            </div>

            {/* Address */}
            {!presetAddressId && (
              <div className="space-y-2">
                <Label htmlFor="sc-address">Kundenadresse *</Label>
                <Select
                  value={form.addressId || '_none'}
                  onValueChange={(v) => setForm({ ...form, addressId: v === '_none' ? '' : v, contactId: '' })}
                  disabled={isSubmitting || isEdit}
                >
                  <SelectTrigger id="sc-address">
                    <SelectValue placeholder="Adresse auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">--</SelectItem>
                    {addresses.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.company || a.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Contact */}
            {selectedAddressId && contacts && contacts.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="sc-contact">Kontaktperson</Label>
                <Select
                  value={form.contactId || '_none'}
                  onValueChange={(v) => setForm({ ...form, contactId: v === '_none' ? '' : v })}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="sc-contact">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">--</SelectItem>
                    {contacts.map((c: { id: string; firstName: string; lastName: string }) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="sc-desc">Beschreibung</Label>
              <Textarea
                id="sc-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={isSubmitting}
                rows={3}
                placeholder="Detailbeschreibung des Auftrags"
              />
            </div>

            {/* Assigned Employee */}
            <div className="space-y-2">
              <Label htmlFor="sc-assigned">Zuständiger Mitarbeiter</Label>
              <Select
                value={form.assignedToId || '_none'}
                onValueChange={(v) => setForm({ ...form, assignedToId: v === '_none' ? '' : v })}
                disabled={isSubmitting}
              >
                <SelectTrigger id="sc-assigned">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">--</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer Notified Cost */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sc-cost"
                checked={form.customerNotifiedCost}
                onCheckedChange={(checked) =>
                  setForm({ ...form, customerNotifiedCost: checked === true })
                }
                disabled={isSubmitting}
              />
              <div>
                <Label htmlFor="sc-cost" className="text-sm font-normal">
                  Auf Kosten hingewiesen
                </Label>
                <p className="text-xs text-muted-foreground">
                  Kunde wurde informiert, dass der Einsatz kostenpflichtig ist
                </p>
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

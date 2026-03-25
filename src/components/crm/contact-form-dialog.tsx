'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Wand2 } from 'lucide-react'
import { useCreateCrmContact, useUpdateCrmContact } from '@/hooks'

function generateLetterSalutation(
  salutation: string,
  title: string,
  lastName: string
): string {
  if (!salutation || !lastName) return ""
  if (salutation === "Herr") {
    const titlePart = title ? ` ${title}` : ""
    return `Sehr geehrter Herr${titlePart} ${lastName}`
  }
  if (salutation === "Frau") {
    const titlePart = title ? ` ${title}` : ""
    return `Sehr geehrte Frau${titlePart} ${lastName}`
  }
  return ""
}

interface ContactFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId: string
  contact?: {
    id: string
    firstName: string
    lastName: string
    salutation: string | null
    title: string | null
    letterSalutation: string | null
    position: string | null
    department: string | null
    phone: string | null
    email: string | null
    notes: string | null
    isPrimary: boolean
  } | null
  onSuccess?: () => void
}

interface FormState {
  salutation: string
  title: string
  letterSalutation: string
  firstName: string
  lastName: string
  position: string
  department: string
  phone: string
  email: string
  notes: string
  isPrimary: boolean
}

const INITIAL_STATE: FormState = {
  salutation: '',
  title: '',
  letterSalutation: '',
  firstName: '',
  lastName: '',
  position: '',
  department: '',
  phone: '',
  email: '',
  notes: '',
  isPrimary: false,
}

export function ContactFormDialog({
  open,
  onOpenChange,
  addressId,
  contact,
  onSuccess,
}: ContactFormDialogProps) {
  const t = useTranslations('crmAddresses')
  const isEdit = !!contact

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateCrmContact()
  const updateMutation = useUpdateCrmContact()
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  const letterSalutationManuallyEdited = React.useRef(false)

  React.useEffect(() => {
    if (open) {
      setError(null)
      letterSalutationManuallyEdited.current = false
      if (contact) {
        setForm({
          salutation: contact.salutation || '',
          title: contact.title || '',
          letterSalutation: contact.letterSalutation || '',
          firstName: contact.firstName,
          lastName: contact.lastName,
          position: contact.position || '',
          department: contact.department || '',
          phone: contact.phone || '',
          email: contact.email || '',
          notes: contact.notes || '',
          isPrimary: contact.isPrimary,
        })
      } else {
        setForm(INITIAL_STATE)
      }
    }
  }, [open, contact])

  React.useEffect(() => {
    if (!letterSalutationManuallyEdited.current) {
      const auto = generateLetterSalutation(form.salutation, form.title, form.lastName)
      setForm((p) => ({ ...p, letterSalutation: auto }))
    }
  }, [form.salutation, form.title, form.lastName])

  const handleSubmit = async () => {
    setError(null)

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError(`${t('labelFirstName')} / ${t('labelLastName')} required`)
      return
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: contact!.id,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          salutation: form.salutation || null,
          title: form.title || null,
          letterSalutation: form.letterSalutation.trim() || null,
          position: form.position.trim() || null,
          department: form.department.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          notes: form.notes.trim() || null,
          isPrimary: form.isPrimary,
        })
      } else {
        await createMutation.mutateAsync({
          addressId,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          salutation: form.salutation || undefined,
          title: form.title || undefined,
          letterSalutation: form.letterSalutation.trim() || undefined,
          position: form.position.trim() || undefined,
          department: form.department.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          notes: form.notes.trim() || undefined,
          isPrimary: form.isPrimary,
        })
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editContactTitle') : t('createContactTitle')}</DialogTitle>
          <DialogDescription>{''}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Row: Anrede + Titel */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="salutation">{t('labelSalutation')}</Label>
              <Select
                value={form.salutation}
                onValueChange={(value) => setForm((p) => ({ ...p, salutation: value }))}
                disabled={isSubmitting}
              >
                <SelectTrigger id="salutation">
                  <SelectValue placeholder={t('selectSalutation')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Herr">{t('salutationHerr')}</SelectItem>
                  <SelectItem value="Frau">{t('salutationFrau')}</SelectItem>
                  <SelectItem value="Divers">{t('salutationDivers')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">{t('labelTitle')}</Label>
              <Select
                value={form.title}
                onValueChange={(value) => setForm((p) => ({ ...p, title: value }))}
                disabled={isSubmitting}
              >
                <SelectTrigger id="title">
                  <SelectValue placeholder={t('selectTitle')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dr.">Dr.</SelectItem>
                  <SelectItem value="Prof.">Prof.</SelectItem>
                  <SelectItem value="Prof. Dr.">Prof. Dr.</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row: Vorname + Nachname */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t('labelFirstName')} *</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t('labelLastName')} *</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Row: Briefanrede */}
          <div className="space-y-2">
            <Label htmlFor="letterSalutation">{t('labelLetterSalutation')}</Label>
            <div className="flex gap-2">
              <Input
                id="letterSalutation"
                value={form.letterSalutation}
                onChange={(e) => {
                  letterSalutationManuallyEdited.current = true
                  setForm((p) => ({ ...p, letterSalutation: e.target.value }))
                }}
                placeholder={t('letterSalutationPlaceholder')}
                disabled={isSubmitting}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  const auto = generateLetterSalutation(form.salutation, form.title, form.lastName)
                  if (auto) {
                    setForm((p) => ({ ...p, letterSalutation: auto }))
                    letterSalutationManuallyEdited.current = false
                  }
                }}
                disabled={isSubmitting}
                title={t('autoGenerateLetterSalutation')}
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactPosition">{t('labelPosition')}</Label>
              <Input
                id="contactPosition"
                value={form.position}
                onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactDepartment">{t('labelDepartment')}</Label>
              <Input
                id="contactDepartment"
                value={form.department}
                onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactPhone">{t('labelPhone')}</Label>
              <Input
                id="contactPhone"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">{t('labelEmail')}</Label>
              <Input
                id="contactEmail"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactNotes">{t('labelNotes')}</Label>
            <Textarea
              id="contactNotes"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              disabled={isSubmitting}
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isPrimary"
              checked={form.isPrimary}
              onCheckedChange={(checked) =>
                setForm((p) => ({ ...p, isPrimary: checked === true }))
              }
              disabled={isSubmitting}
            />
            <Label htmlFor="isPrimary">{t('labelIsPrimary')}</Label>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('save') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

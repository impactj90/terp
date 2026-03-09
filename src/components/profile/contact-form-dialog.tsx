'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateEmployeeContact } from '@/hooks/api'
import { AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

type ContactType = 'email' | 'phone' | 'mobile' | 'emergency'

interface ContactFormDialogProps {
  employeeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface FormData {
  contact_type: ContactType
  value: string
  label: string
  is_primary: boolean
}

const contactTypeLabelKeys: Record<ContactType, string> = {
  email: 'contactTypeEmail',
  phone: 'contactTypePhone',
  mobile: 'contactTypeMobile',
  emergency: 'contactTypeEmergency',
}

/**
 * Dialog for creating a new employee contact.
 */
export function ContactFormDialog({
  employeeId,
  open,
  onOpenChange,
  onSuccess,
}: ContactFormDialogProps) {
  const t = useTranslations('profile')
  const tc = useTranslations('common')

  const [formData, setFormData] = useState<FormData>({
    contact_type: 'emergency',
    value: '',
    label: '',
    is_primary: false,
  })
  const [error, setError] = useState<string | null>(null)

  const createContact = useCreateEmployeeContact()

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFormData({
        contact_type: 'emergency',
        value: '',
        label: '',
        is_primary: false,
      })
      setError(null)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate
    if (!formData.value.trim()) {
      setError(t('contactValueRequired'))
      return
    }

    if (formData.value.length > 255) {
      setError(t('contactValueMaxLength'))
      return
    }

    if (formData.label && formData.label.length > 100) {
      setError(t('labelMaxLength'))
      return
    }

    try {
      await createContact.mutateAsync({
        path: { id: employeeId },
        body: {
          contact_type: formData.contact_type,
          value: formData.value.trim(),
          label: formData.label.trim() || undefined,
          is_primary: formData.is_primary,
        },
      })
      onOpenChange(false)
      onSuccess?.()
    } catch {
      setError(t('failedToCreateContact'))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('addContact')}</SheetTitle>
          <SheetDescription>
            {t('addContactDescription')}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="ml-2">{error}</span>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="contactType">{t('contactType')}</Label>
            <Select
              value={formData.contact_type}
              onValueChange={(value: ContactType) =>
                setFormData((prev) => ({ ...prev, contact_type: value }))
              }
            >
              <SelectTrigger id="contactType">
                <SelectValue placeholder={t('selectType')} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(contactTypeLabelKeys).map(([value, labelKey]) => (
                  <SelectItem key={value} value={value}>
                    {t(labelKey as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactValue">{t('value')}</Label>
            <Input
              id="contactValue"
              value={formData.value}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, value: e.target.value }))
              }
              placeholder={
                formData.contact_type === 'email'
                  ? t('emailPlaceholder')
                  : t('phonePlaceholder')
              }
            />
            <p className="text-xs text-muted-foreground">
              {t('valuePlaceholder')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactLabel">{t('labelOptional')}</Label>
            <Input
              id="contactLabel"
              value={formData.label}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, label: e.target.value }))
              }
              placeholder={t('labelPlaceholder')}
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isPrimary"
              checked={formData.is_primary}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, is_primary: e.target.checked }))
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="isPrimary" className="text-sm font-normal">
              {t('setPrimaryContact')}
            </Label>
          </div>

          <SheetFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={createContact.isPending}>
              {createContact.isPending ? t('adding') : t('addContact')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

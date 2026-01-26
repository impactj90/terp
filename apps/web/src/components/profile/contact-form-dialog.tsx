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

const contactTypeLabels: Record<ContactType, string> = {
  email: 'Email',
  phone: 'Phone',
  mobile: 'Mobile',
  emergency: 'Emergency',
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
      setError('Contact value is required')
      return
    }

    if (formData.value.length > 255) {
      setError('Contact value must be less than 255 characters')
      return
    }

    if (formData.label && formData.label.length > 100) {
      setError('Label must be less than 100 characters')
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
      setError('Failed to create contact. Please try again.')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add Contact</SheetTitle>
          <SheetDescription>
            Add a new contact for this employee.
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
            <Label htmlFor="contactType">Contact Type</Label>
            <Select
              value={formData.contact_type}
              onValueChange={(value: ContactType) =>
                setFormData((prev) => ({ ...prev, contact_type: value }))
              }
            >
              <SelectTrigger id="contactType">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(contactTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactValue">Value</Label>
            <Input
              id="contactValue"
              value={formData.value}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, value: e.target.value }))
              }
              placeholder={
                formData.contact_type === 'email'
                  ? 'email@example.com'
                  : '+1 234 567 8900'
              }
            />
            <p className="text-xs text-muted-foreground">
              Enter the contact value (email, phone number, etc.)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactLabel">Label (Optional)</Label>
            <Input
              id="contactLabel"
              value={formData.label}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, label: e.target.value }))
              }
              placeholder="e.g., Work, Personal, Spouse"
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
              Set as primary contact
            </Label>
          </div>

          <SheetFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createContact.isPending}>
              {createContact.isPending ? 'Adding...' : 'Add Contact'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

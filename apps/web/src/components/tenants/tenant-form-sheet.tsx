'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCreateTenant, useUpdateTenant } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Tenant = components['schemas']['Tenant']

interface TenantFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenant?: Tenant | null
  onSuccess?: () => void
}

interface TenantFormState {
  name: string
  slug: string
  addressStreet: string
  addressZip: string
  addressCity: string
  addressCountry: string
  phone: string
  email: string
  payrollExportBasePath: string
  notes: string
  vacationBasis: 'calendar_year' | 'entry_date'
  isActive: boolean
}

const INITIAL_STATE: TenantFormState = {
  name: '',
  slug: '',
  addressStreet: '',
  addressZip: '',
  addressCity: '',
  addressCountry: '',
  phone: '',
  email: '',
  payrollExportBasePath: '',
  notes: '',
  vacationBasis: 'calendar_year',
  isActive: true,
}

export function TenantFormSheet({
  open,
  onOpenChange,
  tenant,
  onSuccess,
}: TenantFormSheetProps) {
  const t = useTranslations('adminTenants')
  const isEdit = !!tenant
  const [form, setForm] = React.useState<TenantFormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false)

  const createMutation = useCreateTenant()
  const updateMutation = useUpdateTenant()

  React.useEffect(() => {
    if (open) {
      if (tenant) {
        setForm({
          name: tenant.name || '',
          slug: tenant.slug || '',
          addressStreet: tenant.address_street || '',
          addressZip: tenant.address_zip || '',
          addressCity: tenant.address_city || '',
          addressCountry: tenant.address_country || '',
          phone: tenant.phone || '',
          email: tenant.email || '',
          payrollExportBasePath: tenant.payroll_export_base_path || '',
          notes: tenant.notes || '',
          vacationBasis: tenant.vacation_basis || 'calendar_year',
          isActive: tenant.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
      setSlugManuallyEdited(false)
    }
  }, [open, tenant])

  const handleNameChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      name: value,
      ...(!isEdit && !slugManuallyEdited
        ? {
            slug: value
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, ''),
          }
        : {}),
    }))
  }

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true)
    setForm((prev) => ({ ...prev, slug: value }))
  }

  function validateForm(formData: TenantFormState): string[] {
    const errors: string[] = []
    if (!formData.name.trim()) errors.push(t('validationNameRequired'))
    if (!isEdit) {
      if (!formData.slug.trim()) errors.push(t('validationSlugRequired'))
      if (formData.slug.length < 3) errors.push(t('validationSlugMinLength'))
      if (!/^[a-z0-9-]+$/.test(formData.slug)) errors.push(t('validationSlugPattern'))
    }
    if (!formData.addressStreet.trim()) errors.push(t('validationStreetRequired'))
    if (!formData.addressZip.trim()) errors.push(t('validationZipRequired'))
    if (!formData.addressCity.trim()) errors.push(t('validationCityRequired'))
    if (!formData.addressCountry.trim()) errors.push(t('validationCountryRequired'))
    return errors
  }

  const handleSubmit = async () => {
    setError(null)

    const errors = validateForm(form)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && tenant) {
        await updateMutation.mutateAsync({
          path: { id: tenant.id },
          body: {
            name: form.name.trim(),
            address_street: form.addressStreet.trim(),
            address_zip: form.addressZip.trim(),
            address_city: form.addressCity.trim(),
            address_country: form.addressCountry.trim(),
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            payroll_export_base_path: form.payrollExportBasePath.trim() || null,
            notes: form.notes.trim() || null,
            vacation_basis: form.vacationBasis,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            name: form.name.trim(),
            slug: form.slug.trim(),
            address_street: form.addressStreet.trim(),
            address_zip: form.addressZip.trim(),
            address_city: form.addressCity.trim(),
            address_country: form.addressCountry.trim(),
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            payroll_export_base_path: form.payrollExportBasePath.trim() || undefined,
            notes: form.notes.trim() || undefined,
            vacation_basis: form.vacationBasis,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? t(isEdit ? 'failedUpdate' : 'failedCreate')
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editTenant') : t('createTenant')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Identity */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionIdentity')}</h3>

              <div className="space-y-2">
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  disabled={isSubmitting}
                  placeholder={t('fieldNamePlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">{t('fieldSlug')} {!isEdit && '*'}</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  disabled={isSubmitting || isEdit}
                  placeholder={t('fieldSlugPlaceholder')}
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  {isEdit ? t('fieldSlugLocked') : t('fieldSlugHint')}
                </p>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionAddress')}</h3>

              <div className="space-y-2">
                <Label htmlFor="street">{t('fieldStreet')} *</Label>
                <Input
                  id="street"
                  value={form.addressStreet}
                  onChange={(e) => setForm((prev) => ({ ...prev, addressStreet: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldStreetPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zip">{t('fieldZip')} *</Label>
                <Input
                  id="zip"
                  value={form.addressZip}
                  onChange={(e) => setForm((prev) => ({ ...prev, addressZip: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldZipPlaceholder')}
                  maxLength={20}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">{t('fieldCity')} *</Label>
                <Input
                  id="city"
                  value={form.addressCity}
                  onChange={(e) => setForm((prev) => ({ ...prev, addressCity: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldCityPlaceholder')}
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">{t('fieldCountry')} *</Label>
                <Input
                  id="country"
                  value={form.addressCountry}
                  onChange={(e) => setForm((prev) => ({ ...prev, addressCountry: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldCountryPlaceholder')}
                  maxLength={100}
                />
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionContact')}</h3>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('fieldPhone')}</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldPhonePlaceholder')}
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('fieldEmail')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldEmailPlaceholder')}
                  maxLength={255}
                />
              </div>
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionSettings')}</h3>

              <div className="space-y-2">
                <Label htmlFor="payrollExportPath">{t('fieldPayrollExportPath')}</Label>
                <Input
                  id="payrollExportPath"
                  value={form.payrollExportBasePath}
                  onChange={(e) => setForm((prev) => ({ ...prev, payrollExportBasePath: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldPayrollExportPathPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">{t('fieldNotes')}</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldNotesPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vacationBasis">{t('fieldVacationBasis')}</Label>
                <Select
                  value={form.vacationBasis}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, vacationBasis: value as 'calendar_year' | 'entry_date' }))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="calendar_year">{t('vacationBasisCalendarYear')}</SelectItem>
                    <SelectItem value="entry_date">{t('vacationBasisEntryDate')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status (only for edit) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionStatus')}</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('fieldActiveDescription')}
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isActive: checked }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

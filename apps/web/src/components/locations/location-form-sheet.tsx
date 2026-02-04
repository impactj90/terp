'use client'

import * as React from 'react'
import { Loader2, ChevronsUpDown, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useCreateLocation,
  useUpdateLocation,
} from '@/hooks/api'
import { cn } from '@/lib/utils'
import type { components } from '@/lib/api/types'

type Location = components['schemas']['Location']

interface LocationFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  location?: Location | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  address: string
  city: string
  country: string
  timezone: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  address: '',
  city: '',
  country: '',
  timezone: '',
  isActive: true,
}

const COMMON_TIMEZONES = [
  // Europe
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Copenhagen',
  'Europe/Oslo',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Europe/Bucharest',
  'Europe/Budapest',
  'Europe/Kiev',
  // Americas
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'America/Buenos_Aires',
  'America/Bogota',
  'America/Lima',
  // Asia
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Seoul',
  'Asia/Mumbai',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Bangkok',
  'Asia/Jakarta',
  // Pacific / Australia
  'Pacific/Auckland',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Honolulu',
  // Africa
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
]

export function LocationFormSheet({
  open,
  onOpenChange,
  location,
  onSuccess,
}: LocationFormSheetProps) {
  const t = useTranslations('adminLocations')
  const isEdit = !!location
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [tzOpen, setTzOpen] = React.useState(false)
  const [tzSearch, setTzSearch] = React.useState('')

  const createMutation = useCreateLocation()
  const updateMutation = useUpdateLocation()

  React.useEffect(() => {
    if (open) {
      if (location) {
        setForm({
          code: location.code || '',
          name: location.name || '',
          description: location.description || '',
          address: location.address || '',
          city: location.city || '',
          country: location.country || '',
          timezone: location.timezone || '',
          isActive: location.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
      setTzSearch('')
    }
  }, [open, location])

  const filteredTimezones = React.useMemo(() => {
    if (!tzSearch.trim()) return COMMON_TIMEZONES
    const searchLower = tzSearch.toLowerCase()
    return COMMON_TIMEZONES.filter((tz) =>
      tz.toLowerCase().includes(searchLower)
    )
  }, [tzSearch])

  function validateForm(formData: FormState): string[] {
    const errors: string[] = []

    if (!formData.code.trim()) {
      errors.push(t('validationCodeRequired'))
    } else if (formData.code.length > 20) {
      errors.push(t('validationCodeMaxLength'))
    }

    if (!formData.name.trim()) {
      errors.push(t('validationNameRequired'))
    }

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
      if (isEdit && location) {
        await updateMutation.mutateAsync({
          path: { id: location.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            address: form.address.trim() || undefined,
            city: form.city.trim() || undefined,
            country: form.country.trim() || undefined,
            timezone: form.timezone || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            address: form.address.trim() || undefined,
            city: form.city.trim() || undefined,
            country: form.country.trim() || undefined,
            timezone: form.timezone || undefined,
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
          <SheetTitle>{isEdit ? t('editLocation') : t('newLocation')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label htmlFor="code">{t('fieldCode')} *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                  }
                  disabled={isSubmitting || isEdit}
                  placeholder={t('codePlaceholder')}
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  {t('codeHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('namePlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionAddress')}</h3>

              <div className="space-y-2">
                <Label htmlFor="address">{t('fieldAddress')}</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('addressPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">{t('fieldCity')}</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('cityPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">{t('fieldCountry')}</Label>
                <Input
                  id="country"
                  value={form.country}
                  onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('countryPlaceholder')}
                />
              </div>
            </div>

            {/* Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionConfiguration')}</h3>

              <div className="space-y-2">
                <Label>{t('fieldTimezone')}</Label>
                <Popover open={tzOpen} onOpenChange={setTzOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={tzOpen}
                      className="w-full justify-between font-normal"
                      disabled={isSubmitting}
                    >
                      {form.timezone || t('timezonePlaceholder')}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="p-2">
                      <Input
                        placeholder={t('timezoneSearchPlaceholder')}
                        value={tzSearch}
                        onChange={(e) => setTzSearch(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto px-1 pb-1">
                      {filteredTimezones.length === 0 ? (
                        <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                          {t('timezoneNoResults')}
                        </p>
                      ) : (
                        filteredTimezones.map((tz) => (
                          <button
                            key={tz}
                            type="button"
                            className={cn(
                              'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                              form.timezone === tz && 'bg-accent text-accent-foreground'
                            )}
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                timezone: prev.timezone === tz ? '' : tz,
                              }))
                              setTzOpen(false)
                              setTzSearch('')
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                form.timezone === tz ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {tz}
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
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

'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Copy, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { useCreateDemoTenant, useDemoTemplates } from '@/hooks'

interface DemoCreateSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FormState {
  tenantName: string
  tenantSlug: string
  addressStreet: string
  addressZip: string
  addressCity: string
  addressCountry: string
  adminEmail: string
  adminDisplayName: string
  demoTemplate: string
  demoDurationDays: number
  notes: string
}

const INITIAL_STATE: FormState = {
  tenantName: '',
  tenantSlug: '',
  addressStreet: '',
  addressZip: '',
  addressCity: '',
  addressCountry: 'DE',
  adminEmail: '',
  adminDisplayName: '',
  demoTemplate: '',
  demoDurationDays: 14,
  notes: '',
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function DemoCreateSheet({ open, onOpenChange }: DemoCreateSheetProps) {
  const t = useTranslations('adminTenants')
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [inviteLink, setInviteLink] = React.useState<string | null>(null)

  const { data: templates, isLoading: templatesLoading } = useDemoTemplates({ enabled: open })
  const create = useCreateDemoTenant()

  React.useEffect(() => {
    if (open) {
      setForm({
        ...INITIAL_STATE,
        demoTemplate: templates?.[0]?.key ?? '',
      })
      setSlugManuallyEdited(false)
      setError(null)
      setInviteLink(null)
    }
  }, [open, templates])

  const handleNameChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      tenantName: value,
      ...(slugManuallyEdited ? {} : { tenantSlug: slugify(value) }),
    }))
  }

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true)
    setForm((prev) => ({ ...prev, tenantSlug: value }))
  }

  const validate = (data: FormState): string[] => {
    const errs: string[] = []
    if (!data.tenantName.trim()) errs.push(t('demo.createSheet.validationNameRequired'))
    if (!data.tenantSlug.trim() || data.tenantSlug.length < 3) {
      errs.push(t('demo.createSheet.validationSlugRequired'))
    }
    if (!/^[a-z0-9-]+$/.test(data.tenantSlug)) {
      errs.push(t('demo.createSheet.validationSlugPattern'))
    }
    if (!data.addressStreet.trim()) errs.push(t('demo.createSheet.validationStreetRequired'))
    if (!data.addressZip.trim()) errs.push(t('demo.createSheet.validationZipRequired'))
    if (!data.addressCity.trim()) errs.push(t('demo.createSheet.validationCityRequired'))
    if (!data.addressCountry.trim()) errs.push(t('demo.createSheet.validationCountryRequired'))
    if (!/.+@.+\..+/.test(data.adminEmail)) errs.push(t('demo.createSheet.validationEmailRequired'))
    if (!data.adminDisplayName.trim()) errs.push(t('demo.createSheet.validationDisplayNameRequired'))
    if (!data.demoTemplate) errs.push(t('demo.createSheet.validationTemplateRequired'))
    if (data.demoDurationDays < 1 || data.demoDurationDays > 90) {
      errs.push(t('demo.createSheet.validationDurationRange'))
    }
    return errs
  }

  const handleSubmit = async () => {
    setError(null)
    const errs = validate(form)
    if (errs.length > 0) {
      setError(errs.join('. '))
      return
    }

    try {
      const result = await create.mutateAsync({
        tenantName: form.tenantName.trim(),
        tenantSlug: form.tenantSlug.trim(),
        addressStreet: form.addressStreet.trim(),
        addressZip: form.addressZip.trim(),
        addressCity: form.addressCity.trim(),
        addressCountry: form.addressCountry.trim(),
        adminEmail: form.adminEmail.trim(),
        adminDisplayName: form.adminDisplayName.trim(),
        demoTemplate: form.demoTemplate,
        demoDurationDays: form.demoDurationDays,
        notes: form.notes.trim() || null,
      })

      toast.success(t('demo.createSheet.successToast'))
      if (result?.inviteLink) {
        setInviteLink(result.inviteLink)
      } else {
        onOpenChange(false)
      }
    } catch (err) {
      const apiErr = err as { message?: string }
      setError(apiErr.message ?? t('demo.createSheet.failedCreate'))
    }
  }

  const handleCopyLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      toast.success(t('demo.createSheet.linkCopied'))
    } catch {
      toast.error(t('demo.createSheet.linkCopyFailed'))
    }
  }

  const isSubmitting = create.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('demo.createSheet.title')}</SheetTitle>
          <SheetDescription>{t('demo.createSheet.description')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {inviteLink ? (
              <div className="space-y-4">
                <Alert>
                  <AlertDescription>
                    {t('demo.createSheet.inviteLinkNote')}
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label>{t('demo.createSheet.inviteLinkLabel')}</Label>
                  <div className="flex gap-2">
                    <Input value={inviteLink} readOnly className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={handleCopyLink}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {t('demo.createSheet.sectionTenant')}
                  </h3>

                  <div className="space-y-2">
                    <Label htmlFor="demo-name">{t('demo.createSheet.fieldName')} *</Label>
                    <Input
                      id="demo-name"
                      value={form.tenantName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      disabled={isSubmitting}
                      placeholder={t('demo.createSheet.fieldNamePlaceholder')}
                      maxLength={255}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-slug">{t('demo.createSheet.fieldSlug')} *</Label>
                    <Input
                      id="demo-slug"
                      value={form.tenantSlug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      disabled={isSubmitting}
                      placeholder={t('demo.createSheet.fieldSlugPlaceholder')}
                      maxLength={100}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {t('demo.createSheet.sectionAddress')}
                  </h3>

                  <div className="space-y-2">
                    <Label htmlFor="demo-street">{t('demo.createSheet.fieldStreet')} *</Label>
                    <Input
                      id="demo-street"
                      value={form.addressStreet}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, addressStreet: e.target.value }))
                      }
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="demo-zip">{t('demo.createSheet.fieldZip')} *</Label>
                      <Input
                        id="demo-zip"
                        value={form.addressZip}
                        onChange={(e) => setForm((p) => ({ ...p, addressZip: e.target.value }))}
                        disabled={isSubmitting}
                        maxLength={20}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="demo-city">{t('demo.createSheet.fieldCity')} *</Label>
                      <Input
                        id="demo-city"
                        value={form.addressCity}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, addressCity: e.target.value }))
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-country">{t('demo.createSheet.fieldCountry')} *</Label>
                    <Input
                      id="demo-country"
                      value={form.addressCountry}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, addressCountry: e.target.value }))
                      }
                      disabled={isSubmitting}
                      maxLength={100}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {t('demo.createSheet.sectionAdmin')}
                  </h3>

                  <div className="space-y-2">
                    <Label htmlFor="demo-email">{t('demo.createSheet.fieldAdminEmail')} *</Label>
                    <Input
                      id="demo-email"
                      type="email"
                      value={form.adminEmail}
                      onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))}
                      disabled={isSubmitting}
                      placeholder={t('demo.createSheet.fieldAdminEmailPlaceholder')}
                      maxLength={255}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-display">{t('demo.createSheet.fieldAdminName')} *</Label>
                    <Input
                      id="demo-display"
                      value={form.adminDisplayName}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, adminDisplayName: e.target.value }))
                      }
                      disabled={isSubmitting}
                      placeholder={t('demo.createSheet.fieldAdminNamePlaceholder')}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {t('demo.createSheet.sectionDemo')}
                  </h3>

                  <div className="space-y-2">
                    <Label htmlFor="demo-template">{t('demo.createSheet.fieldTemplate')} *</Label>
                    <Select
                      value={form.demoTemplate}
                      onValueChange={(value) =>
                        setForm((p) => ({ ...p, demoTemplate: value }))
                      }
                      disabled={isSubmitting || templatesLoading}
                    >
                      <SelectTrigger id="demo-template">
                        <SelectValue placeholder={t('demo.createSheet.fieldTemplatePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(templates ?? []).map((tpl) => (
                          <SelectItem key={tpl.key} value={tpl.key}>
                            <div className="flex flex-col">
                              <span>{tpl.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {tpl.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-duration">{t('demo.createSheet.fieldDuration')} *</Label>
                    <Input
                      id="demo-duration"
                      type="number"
                      min={1}
                      max={90}
                      value={form.demoDurationDays}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          demoDurationDays: Number.parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('demo.createSheet.fieldDurationHint')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-notes">{t('demo.createSheet.fieldNotes')}</Label>
                    <Textarea
                      id="demo-notes"
                      value={form.notes}
                      onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                      disabled={isSubmitting}
                      rows={3}
                      placeholder={t('demo.createSheet.fieldNotesPlaceholder')}
                    />
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          {inviteLink ? (
            <Button className="flex-1" onClick={() => onOpenChange(false)}>
              {t('demo.createSheet.close')}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="flex-1"
              >
                {t('demo.createSheet.cancel')}
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? t('demo.createSheet.saving') : t('demo.createSheet.create')}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Info } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useDunningTemplate,
  useCreateDunningTemplate,
  useUpdateDunningTemplate,
} from '@/hooks'
import { toast } from 'sonner'

interface DunningTemplateFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string | null
}

interface FormState {
  name: string
  level: number
  headerText: string
  footerText: string
  emailSubject: string
  emailBody: string
  isDefault: boolean
}

const INITIAL: FormState = {
  name: '',
  level: 1,
  headerText: '',
  footerText: '',
  emailSubject: '',
  emailBody: '',
  isDefault: false,
}

export function DunningTemplateFormSheet({
  open,
  onOpenChange,
  templateId,
}: DunningTemplateFormSheetProps) {
  const t = useTranslations('billingDunning')

  const isEdit = !!templateId
  const { data: existing } = useDunningTemplate(templateId ?? '', open && isEdit)
  const createMutation = useCreateDunningTemplate()
  const updateMutation = useUpdateDunningTemplate()

  const [form, setForm] = React.useState<FormState>(INITIAL)

  React.useEffect(() => {
    if (!open) return
    if (isEdit && existing) {
      const e = existing as Partial<FormState> & { name: string; level: number }
      setForm({
        name: e.name,
        level: e.level,
        headerText: e.headerText ?? '',
        footerText: e.footerText ?? '',
        emailSubject: e.emailSubject ?? '',
        emailBody: e.emailBody ?? '',
        isDefault: e.isDefault ?? false,
      })
    } else if (!isEdit) {
      setForm(INITIAL)
    }
  }, [open, isEdit, existing])

  const isPending = createMutation.isPending || updateMutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error(t('templates.nameRequired'))
      return
    }
    const payload = {
      name: form.name.trim(),
      level: form.level,
      headerText: form.headerText,
      footerText: form.footerText,
      emailSubject: form.emailSubject,
      emailBody: form.emailBody,
      isDefault: form.isDefault,
    }
    try {
      if (isEdit && templateId) {
        await updateMutation.mutateAsync({ id: templateId, ...payload })
        toast.success(t('templates.updated'))
      } else {
        await createMutation.mutateAsync(payload)
        toast.success(t('templates.created'))
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : isEdit
            ? t('templates.updateError')
            : t('templates.createError')
      )
    }
  }

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col overflow-hidden"
      >
        <SheetHeader>
          <SheetTitle>
            {isEdit ? t('templates.editTitle') : t('templates.createTitle')}
          </SheetTitle>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dt-name">{t('templates.fieldName')}</Label>
                  <Input
                    id="dt-name"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dt-level">{t('templates.fieldLevel')}</Label>
                  <Select
                    value={String(form.level)}
                    onValueChange={(v) => update('level', parseInt(v, 10))}
                    disabled={isPending}
                  >
                    <SelectTrigger id="dt-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((l) => (
                        <SelectItem key={l} value={String(l)}>
                          {t('templates.levelBadge', { level: l })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium mb-1">
                    {t('templates.placeholderTitle')}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    <code>{`{{briefanrede}}`}</code>
                    <span>{t('templates.phBriefanrede')}</span>
                    <code>{`{{firma}}`}</code>
                    <span>{t('templates.phFirma')}</span>
                    <code>{`{{anrede}}`}</code>
                    <span>{t('templates.phAnrede')}</span>
                    <code>{`{{nachname}}`}</code>
                    <span>{t('templates.phNachname')}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dt-header">
                  {t('templates.fieldHeaderText')}
                </Label>
                <Textarea
                  id="dt-header"
                  value={form.headerText}
                  onChange={(e) => update('headerText', e.target.value)}
                  rows={4}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dt-footer">
                  {t('templates.fieldFooterText')}
                </Label>
                <Textarea
                  id="dt-footer"
                  value={form.footerText}
                  onChange={(e) => update('footerText', e.target.value)}
                  rows={4}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dt-subject">
                  {t('templates.fieldEmailSubject')}
                </Label>
                <Input
                  id="dt-subject"
                  value={form.emailSubject}
                  onChange={(e) => update('emailSubject', e.target.value)}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dt-body">{t('templates.fieldEmailBody')}</Label>
                <Textarea
                  id="dt-body"
                  value={form.emailBody}
                  onChange={(e) => update('emailBody', e.target.value)}
                  rows={6}
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="dt-default"
                  checked={form.isDefault}
                  onCheckedChange={(v) => update('isDefault', v === true)}
                  disabled={isPending}
                />
                <Label htmlFor="dt-default" className="text-sm">
                  {t('templates.fieldIsDefault')}
                </Label>
              </div>
            </div>
          </div>

          <SheetFooter className="border-t pt-4 flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="flex-1"
            >
              {t('detail.cancel')}
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isEdit ? t('templates.save') : t('templates.create')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

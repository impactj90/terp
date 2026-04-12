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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Info } from 'lucide-react'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import {
  useCreateBillingDocumentTemplate,
  useUpdateBillingDocumentTemplate,
  useBillingDocumentTemplates,
} from '@/hooks'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

const DOCUMENT_TYPES = [
  { value: 'OFFER', label: 'Angebot' },
  { value: 'ORDER_CONFIRMATION', label: 'Auftragsbestätigung' },
  { value: 'DELIVERY_NOTE', label: 'Lieferschein' },
  { value: 'SERVICE_NOTE', label: 'Leistungsschein' },
  { value: 'RETURN_DELIVERY', label: 'Rücklieferschein' },
  { value: 'INVOICE', label: 'Rechnung' },
  { value: 'CREDIT_NOTE', label: 'Gutschrift' },
]

interface TemplateFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string | null
}

export function TemplateFormSheet({ open, onOpenChange, templateId }: TemplateFormSheetProps) {
  const t = useTranslations('billingTemplates')
  const { data: templates = [] } = useBillingDocumentTemplates()
  const createMutation = useCreateBillingDocumentTemplate()
  const updateMutation = useUpdateBillingDocumentTemplate()

  const existing = templateId ? templates.find((t) => t.id === templateId) : null
  const isEdit = !!existing

  const [name, setName] = React.useState('')
  const [documentType, setDocumentType] = React.useState<string>('')
  const [headerText, setHeaderText] = React.useState('')
  const [footerText, setFooterText] = React.useState('')
  const [isDefault, setIsDefault] = React.useState(false)

  // Reset form when opened or template changes
  React.useEffect(() => {
    if (open && existing) {
      setName(existing.name)
      setDocumentType(existing.documentType ?? '')
      setHeaderText(existing.headerText ?? '')
      setFooterText(existing.footerText ?? '')
      setIsDefault(existing.isDefault)
    } else if (open && !existing) {
      setName('')
      setDocumentType('')
      setHeaderText('')
      setFooterText('')
      setIsDefault(false)
    }
  }, [open, existing])

  const isPending = createMutation.isPending || updateMutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Name ist erforderlich')
      return
    }

    const data = {
      name: name.trim(),
      documentType: documentType || null,
      headerText: headerText || null,
      footerText: footerText || null,
      isDefault,
    } as Parameters<typeof createMutation.mutateAsync>[0]

    try {
      if (isEdit && templateId) {
        await updateMutation.mutateAsync({ id: templateId, ...data })
        toast.success('Vorlage aktualisiert')
      } else {
        await createMutation.mutateAsync(data)
        toast.success('Vorlage erstellt')
      }
      onOpenChange(false)
    } catch {
      toast.error(isEdit ? 'Fehler beim Aktualisieren' : 'Fehler beim Erstellen')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Standard Angebot"
            />
          </div>

          <div className="space-y-2">
            <Label>Dokumenttyp</Label>
            <Select
              value={documentType || '__all__'}
              onValueChange={(v) => setDocumentType(v === '__all__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Alle Typen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle Typen</SelectItem>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Placeholder hint */}
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium mb-1">{t('placeholderTitle')}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <code>{`{{${t('phBriefanrede')}}}`}</code><span>{t('phBriefanredeDesc')}</span>
                <code>{`{{${t('phAnrede')}}}`}</code><span>{t('phAnredeDesc')}</span>
                <code>{`{{${t('phTitel')}}}`}</code><span>{t('phTitelDesc')}</span>
                <code>{`{{${t('phVorname')}}}`}</code><span>{t('phVornameDesc')}</span>
                <code>{`{{${t('phNachname')}}}`}</code><span>{t('phNachnameDesc')}</span>
                <code>{`{{${t('phFirma')}}}`}</code><span>{t('phFirmaDesc')}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Kopftext</Label>
            <div className="border rounded-md p-2 min-h-[80px]">
              <RichTextEditor
                content={headerText}
                onUpdate={setHeaderText}
                placeholder="Einleitungstext..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Schlusstext</Label>
            <div className="border rounded-md p-2 min-h-[80px]">
              <RichTextEditor
                content={footerText}
                onUpdate={setFooterText}
                placeholder="Schlusstext..."
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="tpl-default"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked === true)}
              disabled={!documentType}
            />
            <Label htmlFor="tpl-default" className="text-sm">
              Als Standard für diesen Typ setzen
            </Label>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isEdit ? 'Speichern' : 'Erstellen'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Eye, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  useEmailTemplate,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
} from '@/hooks/use-email-templates'
import { getAllDocumentTypes } from '@/lib/email/default-templates'
import { resolvePlaceholders } from '@/lib/services/email-placeholder-resolver'
import { renderBaseEmail } from '@/lib/email/templates/base-document-email'

const DOCUMENT_TYPES = getAllDocumentTypes()

const DOC_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'Rechnung',
  OFFER: 'Angebot',
  ORDER_CONFIRMATION: 'Auftragsbestätigung',
  CREDIT_NOTE: 'Gutschrift',
  DELIVERY_NOTE: 'Lieferschein',
  SERVICE_NOTE: 'Serviceschein',
  RETURN_DELIVERY: 'Rücklieferschein',
  PURCHASE_ORDER: 'Bestellung',
}

const PLACEHOLDERS = [
  '{Kundenname}',
  '{Anrede}',
  '{Dokumentennummer}',
  '{Betrag}',
  '{Fälligkeitsdatum}',
  '{Firmenname}',
  '{Projektname}',
]

const SAMPLE_DATA = {
  kundenname: 'Muster GmbH',
  anrede: 'Herr Müller',
  dokumentennummer: 'RE-2026-001',
  betrag: '6.241,31 €',
  faelligkeitsdatum: '15.05.2026',
  firmenname: 'Ihre Firma GmbH',
  projektname: 'Projekt Alpha',
}

interface EmailTemplateSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editId: string | null
}

export function EmailTemplateSheet({
  open,
  onOpenChange,
  editId,
}: EmailTemplateSheetProps) {
  const t = useTranslations('adminEmailSettings')
  const { data: existing, isLoading: loadingExisting } = useEmailTemplate(
    editId ?? ''
  )
  const createMutation = useCreateEmailTemplate()
  const updateMutation = useUpdateEmailTemplate()

  const [name, setName] = React.useState('')
  const [documentType, setDocumentType] = React.useState('INVOICE')
  const [subject, setSubject] = React.useState('')
  const [bodyHtml, setBodyHtml] = React.useState('')
  const [isDefault, setIsDefault] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<'edit' | 'preview'>('edit')

  const subjectRef = React.useRef<HTMLInputElement>(null)

  // Compute preview HTML for srcDoc
  const previewHtml = React.useMemo(() => {
    if (activeTab !== 'preview') return ''
    const resolvedBody = resolvePlaceholders(bodyHtml, SAMPLE_DATA)
    return renderBaseEmail({
      bodyHtml: resolvedBody,
      companyName: SAMPLE_DATA.firmenname,
    })
  }, [activeTab, bodyHtml])

  // Reset form when sheet opens
  React.useEffect(() => {
    if (open && !editId) {
      setName('')
      setDocumentType('INVOICE')
      setSubject('')
      setBodyHtml('')
      setIsDefault(false)
      setActiveTab('edit')
    }
  }, [open, editId])

  // Populate form when editing
  React.useEffect(() => {
    if (existing && editId) {
      setName(existing.name)
      setDocumentType(existing.documentType)
      setSubject(existing.subject)
      setBodyHtml(existing.bodyHtml)
      setIsDefault(existing.isDefault)
    }
  }, [existing, editId])

  function insertPlaceholder(
    placeholder: string,
    target: 'subject' | 'body'
  ) {
    if (target === 'subject') {
      const el = subjectRef.current
      if (el) {
        const start = el.selectionStart ?? subject.length
        const newVal =
          subject.slice(0, start) + placeholder + subject.slice(start)
        setSubject(newVal)
      }
    } else {
      setBodyHtml((prev) => prev + placeholder)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (editId) {
        await updateMutation.mutateAsync({
          id: editId,
          name,
          documentType,
          subject,
          bodyHtml,
          isDefault,
        })
        toast.success(t('templateUpdateSuccess'))
      } else {
        await createMutation.mutateAsync({
          name,
          documentType,
          subject,
          bodyHtml,
          isDefault,
        })
        toast.success(t('templateCreateSuccess'))
      }
      onOpenChange(false)
    } catch {
      toast.error(t('templateSaveFailed'))
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const resolvedSubject = resolvePlaceholders(subject, SAMPLE_DATA)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {editId ? t('templateEdit') : t('templateCreate')}
          </SheetTitle>
        </SheetHeader>

        {editId && loadingExisting ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">{t('templateName')}</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-doc-type">
                  {t('templateDocumentType')}
                </Label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger id="template-doc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {DOC_TYPE_LABELS[type] ?? type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-subject">{t('templateSubject')}</Label>
              <Input
                id="template-subject"
                ref={subjectRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
              <div className="flex flex-wrap gap-1">
                {PLACEHOLDERS.map((p) => (
                  <Badge
                    key={p}
                    variant="outline"
                    className="cursor-pointer hover:bg-accent text-xs"
                    onClick={() => insertPlaceholder(p, 'subject')}
                  >
                    {p}
                  </Badge>
                ))}
              </div>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}
            >
              <TabsList className="w-full">
                <TabsTrigger value="edit" className="flex-1 gap-1">
                  <Pencil className="h-3.5 w-3.5" />
                  {t('templateTabEdit')}
                </TabsTrigger>
                <TabsTrigger value="preview" className="flex-1 gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {t('templateTabPreview')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="edit" className="space-y-2 mt-3">
                <div className="border rounded-md p-2 min-h-[200px]">
                  <RichTextEditor
                    content={bodyHtml}
                    onUpdate={setBodyHtml}
                    placeholder={t('templateBodyPlaceholder')}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {PLACEHOLDERS.map((p) => (
                    <Badge
                      key={p}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent text-xs"
                      onClick={() => insertPlaceholder(p, 'body')}
                    >
                      {p}
                    </Badge>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-3">
                <div className="space-y-3">
                  {/* Subject preview */}
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">{t('templateSubject')}:</span>
                    <p className="text-sm font-medium mt-0.5">{resolvedSubject || '—'}</p>
                  </div>
                  {/* Email body preview in iframe */}
                  <div className="rounded-md border overflow-hidden bg-white">
                    <iframe
                      title="E-Mail-Vorschau"
                      srcDoc={previewHtml}
                      sandbox=""
                      className="w-full border-0"
                      style={{ height: '400px' }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('templatePreviewHint')}
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex items-center gap-3">
              <Switch
                id="template-default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
              <Label htmlFor="template-default">
                {t('templateSetDefault')}
              </Label>
            </div>

            <SheetFooter>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editId ? t('save') : t('templateCreate')}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
}

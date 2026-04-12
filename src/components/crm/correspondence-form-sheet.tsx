'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { useCreateCrmCorrespondence, useUpdateCrmCorrespondence, useCrmCorrespondenceAttachments } from '@/hooks'
import { toast } from 'sonner'
import { CorrespondenceAttachmentList } from './correspondence-attachment-list'
import { CorrespondenceAttachmentUpload } from './correspondence-attachment-upload'

interface FormState {
  direction: 'INCOMING' | 'OUTGOING' | 'INTERNAL'
  type: string
  date: string
  contactId: string
  fromUser: string
  toUser: string
  subject: string
  content: string
}

const INITIAL_STATE: FormState = {
  direction: 'INCOMING',
  type: 'phone',
  date: new Date().toISOString().slice(0, 10),
  contactId: '',
  fromUser: '',
  toUser: '',
  subject: '',
  content: '',
}

interface CrmContact {
  id: string
  firstName: string
  lastName: string
}

interface CorrespondenceFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId: string
  editItem?: Record<string, unknown> | null
  contacts?: CrmContact[]
}

export function CorrespondenceFormSheet({
  open,
  onOpenChange,
  addressId,
  editItem,
  contacts = [],
}: CorrespondenceFormSheetProps) {
  const t = useTranslations('crmCorrespondence')
  const isEdit = !!editItem

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateCrmCorrespondence()
  const updateMutation = useUpdateCrmCorrespondence()
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  React.useEffect(() => {
    if (open) {
      setError(null)
      if (editItem) {
        const dateVal = editItem.date
          ? new Date(editItem.date as string).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10)
        setForm({
          direction: (editItem.direction as FormState['direction']) || 'INCOMING',
          type: (editItem.type as string) || 'phone',
          date: dateVal,
          contactId: (editItem.contactId as string) || '',
          fromUser: (editItem.fromUser as string) || '',
          toUser: (editItem.toUser as string) || '',
          subject: (editItem.subject as string) || '',
          content: (editItem.content as string) || '',
        })
      } else {
        setForm({
          ...INITIAL_STATE,
          date: new Date().toISOString().slice(0, 10),
        })
      }
    }
  }, [open, editItem])

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false)
    }
  }

  const handleSubmit = async () => {
    setError(null)

    if (!form.subject.trim()) {
      setError(t('subject') + ' required')
      return
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: editItem!.id as string,
          direction: form.direction,
          type: form.type,
          date: new Date(form.date),
          contactId: form.contactId || null,
          fromUser: form.fromUser.trim() || null,
          toUser: form.toUser.trim() || null,
          subject: form.subject.trim(),
          content: form.content.trim() || null,
        })
      } else {
        await createMutation.mutateAsync({
          addressId,
          direction: form.direction,
          type: form.type,
          date: new Date(form.date),
          contactId: form.contactId || undefined,
          fromUser: form.fromUser.trim() || undefined,
          toUser: form.toUser.trim() || undefined,
          subject: form.subject.trim(),
          content: form.content.trim() || undefined,
        })
      }

      toast.success(isEdit ? t('save') : t('create'))
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editTitle') : t('createTitle')}</SheetTitle>
          <SheetDescription>{''}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Basic Data */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('basicData')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="corrDirection">{t('direction')} *</Label>
                  <Select
                    value={form.direction}
                    onValueChange={(v) => updateField('direction', v as FormState['direction'])}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="corrDirection">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INCOMING">{t('directionIncoming')}</SelectItem>
                      <SelectItem value="OUTGOING">{t('directionOutgoing')}</SelectItem>
                      <SelectItem value="INTERNAL">{t('directionInternal')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="corrType">{t('type')} *</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => updateField('type', v)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="corrType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">{t('typePhone')}</SelectItem>
                      <SelectItem value="email">{t('typeEmail')}</SelectItem>
                      <SelectItem value="letter">{t('typeLetter')}</SelectItem>
                      <SelectItem value="fax">{t('typeFax')}</SelectItem>
                      <SelectItem value="visit">{t('typeVisit')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="corrDate">{t('date')} *</Label>
                <Input
                  id="corrDate"
                  type="date"
                  value={form.date}
                  onChange={(e) => updateField('date', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Participants */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('participants')}</h3>
              <div className="space-y-2">
                <Label htmlFor="corrContact">{t('contact')}</Label>
                <Select
                  value={form.contactId || '_none'}
                  onValueChange={(v) => updateField('contactId', v === '_none' ? '' : v)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="corrContact">
                    <SelectValue placeholder={t('selectContact')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t('noContact')}</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="corrFromUser">{t('fromUser')}</Label>
                  <Input
                    id="corrFromUser"
                    value={form.fromUser}
                    onChange={(e) => updateField('fromUser', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="corrToUser">{t('toUser')}</Label>
                  <Input
                    id="corrToUser"
                    value={form.toUser}
                    onChange={(e) => updateField('toUser', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('contentSection')}</h3>
              <div className="space-y-2">
                <Label htmlFor="corrSubject">{t('subject')} *</Label>
                <Input
                  id="corrSubject"
                  value={form.subject}
                  onChange={(e) => updateField('subject', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="corrContent">{t('content')}</Label>
                <Textarea
                  id="corrContent"
                  value={form.content}
                  onChange={(e) => updateField('content', e.target.value)}
                  disabled={isSubmitting}
                  rows={5}
                />
              </div>
            </div>

            {/* Attachments -- only in edit mode */}
            {isEdit && editItem?.id ? (
              <CorrespondenceAttachmentSection
                correspondenceId={editItem.id as string}
                disabled={isSubmitting}
              />
            ) : null}

            {/* Hint in create mode */}
            {!isEdit && (
              <p className="text-xs text-muted-foreground">{t('attachmentsHintCreate')}</p>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t('save') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** Wrapper component to use hooks for attachments (hooks can't be called conditionally) */
function CorrespondenceAttachmentSection({
  correspondenceId,
  disabled,
}: {
  correspondenceId: string
  disabled: boolean
}) {
  const t = useTranslations('crmCorrespondence')
  const { data: attachments } = useCrmCorrespondenceAttachments(correspondenceId)
  const currentCount = attachments?.length ?? 0

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">
        {t('attachmentSection')}
      </h3>
      <CorrespondenceAttachmentList correspondenceId={correspondenceId} />
      <CorrespondenceAttachmentUpload
        correspondenceId={correspondenceId}
        disabled={disabled}
        currentCount={currentCount}
      />
    </div>
  )
}

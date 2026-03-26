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
import {
  useCreateCrmTask,
  useUpdateCrmTask,
  useCrmAddresses,
  useCrmContacts,
  useCrmInquiries,
} from '@/hooks'
import { TaskAssigneeSelect, type AssigneeItem } from './task-assignee-select'
import { toast } from 'sonner'

interface FormState {
  type: 'TASK' | 'MESSAGE'
  subject: string
  description: string
  addressId: string
  contactId: string
  inquiryId: string
  dueAt: string
  dueTime: string
  durationMin: string
  assignees: AssigneeItem[]
}

const INITIAL_STATE: FormState = {
  type: 'TASK',
  subject: '',
  description: '',
  addressId: '',
  contactId: '',
  inquiryId: '',
  dueAt: '',
  dueTime: '',
  durationMin: '',
  assignees: [],
}

interface TaskFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId?: string
  inquiryId?: string
  editItem?: Record<string, unknown> | null
}

export function TaskFormSheet({
  open,
  onOpenChange,
  addressId: presetAddressId,
  inquiryId: presetInquiryId,
  editItem,
}: TaskFormSheetProps) {
  const t = useTranslations('crmTasks')
  const isEdit = !!editItem

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateCrmTask()
  const updateMutation = useUpdateCrmTask()
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  // Fetch addresses for select
  const { data: addressData } = useCrmAddresses({
    enabled: open && !presetAddressId,
    pageSize: 100,
    isActive: true,
  })
  const addresses = (addressData?.items ?? []) as Array<{ id: string; company: string; number: string }>

  // Fetch contacts for selected address
  const selectedAddressId = form.addressId || presetAddressId
  const { data: contacts } = useCrmContacts(selectedAddressId || '', open && !!selectedAddressId)
  const contactList = (contacts ?? []) as Array<{ id: string; firstName: string; lastName: string }>

  // Fetch inquiries for selected address (or all if no address)
  const { data: inquiryData } = useCrmInquiries({
    enabled: open && !presetInquiryId,
    addressId: selectedAddressId || undefined,
    pageSize: 100,
  })
  const inquiries = (inquiryData?.items ?? []) as Array<{ id: string; title: string; number: string }>

  React.useEffect(() => {
    if (open) {
      setError(null)
      if (editItem) {
        const assigneesRaw = (editItem.assignees ?? []) as Array<{
          employeeId?: string | null
          teamId?: string | null
          employee?: { id: string; firstName: string; lastName: string } | null
          team?: { id: string; name: string } | null
        }>
        setForm({
          type: (editItem.type as 'TASK' | 'MESSAGE') || 'TASK',
          subject: (editItem.subject as string) || '',
          description: (editItem.description as string) || '',
          addressId: (editItem.addressId as string) || presetAddressId || '',
          contactId: (editItem.contactId as string) || '',
          inquiryId: (editItem.inquiryId as string) || presetInquiryId || '',
          dueAt: editItem.dueAt
            ? new Date(editItem.dueAt as string).toISOString().slice(0, 10)
            : '',
          dueTime: (editItem.dueTime as string) || '',
          durationMin: editItem.durationMin ? String(editItem.durationMin) : '',
          assignees: assigneesRaw.map((a) => ({
            employeeId: a.employeeId || undefined,
            teamId: a.teamId || undefined,
            label: a.employee
              ? `${a.employee.firstName} ${a.employee.lastName}`
              : a.team
                ? a.team.name
                : '',
          })),
        })
      } else {
        setForm({
          ...INITIAL_STATE,
          addressId: presetAddressId || '',
          inquiryId: presetInquiryId || '',
        })
      }
    }
  }, [open, editItem, presetAddressId, presetInquiryId])

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

    if (form.assignees.length === 0) {
      setError(t('assignees') + ' required')
      return
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: editItem!.id as string,
          subject: form.subject.trim(),
          description: form.description.trim() || null,
          addressId: form.addressId || null,
          contactId: form.contactId || null,
          inquiryId: form.inquiryId || null,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          dueTime: form.dueTime || null,
          durationMin: form.durationMin ? parseInt(form.durationMin) : null,
          assignees: form.assignees.map((a) => ({
            employeeId: a.employeeId,
            teamId: a.teamId,
          })),
        })
      } else {
        await createMutation.mutateAsync({
          type: form.type,
          subject: form.subject.trim(),
          description: form.description.trim() || undefined,
          addressId: form.addressId || presetAddressId || undefined,
          contactId: form.contactId || undefined,
          inquiryId: form.inquiryId || presetInquiryId || undefined,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
          dueTime: form.dueTime || undefined,
          durationMin: form.durationMin ? parseInt(form.durationMin) : undefined,
          assignees: form.assignees.map((a) => ({
            employeeId: a.employeeId,
            teamId: a.teamId,
          })),
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
          <SheetTitle>{isEdit ? t('editTask') : t('createTitle')}</SheetTitle>
          <SheetDescription>{''}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Grunddaten */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('basicData')}</h3>

              {/* Type toggle */}
              {!isEdit && (
                <div className="space-y-2">
                  <Label>{t('type')}</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={form.type === 'TASK' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateField('type', 'TASK')}
                      disabled={isSubmitting}
                    >
                      {t('typeTask')}
                    </Button>
                    <Button
                      type="button"
                      variant={form.type === 'MESSAGE' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateField('type', 'MESSAGE')}
                      disabled={isSubmitting}
                    >
                      {t('typeMessage')}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="taskSubject">{t('subject')} *</Label>
                <Input
                  id="taskSubject"
                  value={form.subject}
                  onChange={(e) => updateField('subject', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="taskDescription">{t('description')}</Label>
                <Textarea
                  id="taskDescription"
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
            </div>

            {/* Verknupfungen */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('links')}</h3>

              {/* Address select (hidden when preset) */}
              {!presetAddressId && (
                <div className="space-y-2">
                  <Label>{t('address')}</Label>
                  <Select
                    value={form.addressId || '_none'}
                    onValueChange={(v) => {
                      updateField('addressId', v === '_none' ? '' : v)
                      updateField('contactId', '')
                      updateField('inquiryId', '')
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectAddress')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t('selectAddress')}</SelectItem>
                      {addresses.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.number} — {a.company}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Contact select */}
              {selectedAddressId && (
                <div className="space-y-2">
                  <Label>{t('contact')}</Label>
                  <Select
                    value={form.contactId || '_none'}
                    onValueChange={(v) => updateField('contactId', v === '_none' ? '' : v)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectContact')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t('noContact')}</SelectItem>
                      {contactList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.firstName} {c.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Inquiry select (hidden when preset) */}
              {!presetInquiryId && (
                <div className="space-y-2">
                  <Label>{t('inquiry')}</Label>
                  <Select
                    value={form.inquiryId || '_none'}
                    onValueChange={(v) => updateField('inquiryId', v === '_none' ? '' : v)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectInquiry')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t('noInquiry')}</SelectItem>
                      {inquiries.map((inq) => (
                        <SelectItem key={inq.id} value={inq.id}>
                          {inq.number} — {inq.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Zuweisungen */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('assigneesSection')} *</h3>
              <TaskAssigneeSelect
                value={form.assignees}
                onChange={(v) => updateField('assignees', v)}
                disabled={isSubmitting}
              />
            </div>

            {/* Terminierung - only for TASK type */}
            {form.type === 'TASK' && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('scheduling')}</h3>

                <div className="space-y-2">
                  <Label htmlFor="taskDueAt">{t('dueDate')}</Label>
                  <Input
                    id="taskDueAt"
                    type="date"
                    value={form.dueAt}
                    onChange={(e) => updateField('dueAt', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taskDueTime">{t('dueTime')}</Label>
                  <Input
                    id="taskDueTime"
                    type="time"
                    value={form.dueTime}
                    onChange={(e) => updateField('dueTime', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taskDuration">{t('duration')}</Label>
                  <Input
                    id="taskDuration"
                    type="number"
                    min="1"
                    value={form.durationMin}
                    onChange={(e) => updateField('durationMin', e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
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

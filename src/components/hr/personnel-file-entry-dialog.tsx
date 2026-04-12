'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { CalendarIcon, Loader2, Paperclip, Trash2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTRPC } from '@/trpc'
import { useQueryClient } from '@tanstack/react-query'
import {
  useHrPersonnelFileCategories,
  useCreateHrPersonnelFileEntry,
  useUpdateHrPersonnelFileEntry,
  useHrPersonnelFileEntry,
  useUploadHrPersonnelFileAttachment,
  useDeleteHrPersonnelFileAttachment,
} from '@/hooks'

interface PersonnelFileEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry?: any
  onSuccess?: () => void
}

export function PersonnelFileEntryDialog({
  open,
  onOpenChange,
  employeeId,
  entry,
  onSuccess,
}: PersonnelFileEntryDialogProps) {
  const t = useTranslations('hrPersonnelFile')
  const tc = useTranslations('common')
  const isEdit = !!entry

  // Form state
  const [categoryId, setCategoryId] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [entryDate, setEntryDate] = React.useState<Date | undefined>(new Date())
  const [expiresAt, setExpiresAt] = React.useState<Date | undefined>()
  const [reminderDate, setReminderDate] = React.useState<Date | undefined>()
  const [reminderNote, setReminderNote] = React.useState('')
  const [isConfidential, setIsConfidential] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Calendar month state
  const [entryDateMonth, setEntryDateMonth] = React.useState<Date>(new Date())
  const [expiresAtMonth, setExpiresAtMonth] = React.useState<Date>(new Date())
  const [reminderDateMonth, setReminderDateMonth] = React.useState<Date>(new Date())

  // Hooks
  const { data: categories } = useHrPersonnelFileCategories()
  const createMutation = useCreateHrPersonnelFileEntry()
  const updateMutation = useUpdateHrPersonnelFileEntry()
  const { getUploadUrl, confirmUpload } = useUploadHrPersonnelFileAttachment()
  const deleteAttachmentMutation = useDeleteHrPersonnelFileAttachment()
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  // Load entry details if editing (to get attachments)
  const { data: entryDetail } = useHrPersonnelFileEntry(entry?.id ?? '')

  // File upload state
  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Reset form when dialog opens/entry changes
  React.useEffect(() => {
    if (open) {
      if (entry) {
        setCategoryId(entry.categoryId)
        setTitle(entry.title)
        setDescription(entry.description || '')
        setEntryDate(entry.entryDate ? new Date(entry.entryDate) : new Date())
        setExpiresAt(entry.expiresAt ? new Date(entry.expiresAt) : undefined)
        setReminderDate(entry.reminderDate ? new Date(entry.reminderDate) : undefined)
        setReminderNote(entry.reminderNote || '')
        setIsConfidential(entry.isConfidential || false)
      } else {
        setCategoryId('')
        setTitle('')
        setDescription('')
        setEntryDate(new Date())
        setExpiresAt(undefined)
        setReminderDate(undefined)
        setReminderNote('')
        setIsConfidential(false)
      }
      setError(null)
    }
  }, [open, entry])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!categoryId || !title || !entryDate) {
      setError(t('requiredFieldsMissing'))
      return
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: entry.id,
          categoryId,
          title,
          description: description || null,
          entryDate,
          expiresAt: expiresAt || null,
          reminderDate: reminderDate || null,
          reminderNote: reminderNote || null,
          isConfidential,
        })
      } else {
        await createMutation.mutateAsync({
          employeeId,
          categoryId,
          title,
          description: description || undefined,
          entryDate,
          expiresAt: expiresAt || undefined,
          reminderDate: reminderDate || undefined,
          reminderNote: reminderNote || undefined,
          isConfidential,
        })
      }
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'))
    }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !entry?.id) return
    setUploading(true)

    try {
      for (const file of Array.from(files)) {
        // Step 1: Get signed upload URL
        const { signedUrl, storagePath, token } = await getUploadUrl.mutateAsync({
          entryId: entry.id,
          filename: file.name,
          mimeType: file.type,
        })

        // Step 2: Upload file directly to Supabase Storage
        const uploadResponse = await fetch(signedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type,
            ...(token ? { 'x-upsert': 'true' } : {}),
          },
          body: file,
        })

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`)
        }

        // Step 3: Confirm upload
        await confirmUpload.mutateAsync({
          entryId: entry.id,
          storagePath,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('uploadError'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDownloadAttachment = async (attachmentId: string) => {
    try {
      const result = await queryClient.fetchQuery(
        trpc.hr.personnelFile.attachments.getDownloadUrl.queryOptions({ id: attachmentId })
      )
      if (result?.downloadUrl) {
        window.open(result.downloadUrl, '_blank')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('downloadError'))
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await deleteAttachmentMutation.mutateAsync({ id: attachmentId })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteAttachmentError'))
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const attachments = entryDetail?.attachments ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editEntry') : t('newEntry')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editEntryDescription') : t('newEntryDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <form id="personnel-file-entry-form" onSubmit={handleSubmit} className="space-y-4 py-4">
            {/* Error */}
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Category */}
            <div className="space-y-2">
              <Label>{t('category')} *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-2">
                        {cat.color && (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                        )}
                        {cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label>{t('entryTitle')} *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('titlePlaceholder')}
                maxLength={255}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>{t('description')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
                rows={3}
                maxLength={2000}
              />
            </div>

            {/* Entry Date */}
            <div className="space-y-2">
              <Label>{t('entryDate')} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {entryDate ? format(entryDate, 'dd.MM.yyyy') : t('selectDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    month={entryDateMonth}
                    onMonthChange={setEntryDateMonth}
                    selected={entryDate}
                    onSelect={(date) => { if (date instanceof Date) setEntryDate(date) }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Expires At */}
            <div className="space-y-2">
              <Label>{t('expiresAt')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expiresAt ? format(expiresAt, 'dd.MM.yyyy') : t('noExpiry')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    month={expiresAtMonth}
                    onMonthChange={setExpiresAtMonth}
                    selected={expiresAt}
                    onSelect={(date) => { if (date instanceof Date) setExpiresAt(date) }}
                  />
                </PopoverContent>
              </Popover>
              {expiresAt && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpiresAt(undefined)}
                >
                  {t('clearDate')}
                </Button>
              )}
            </div>

            {/* Reminder Date */}
            <div className="space-y-2">
              <Label>{t('reminderDate')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reminderDate ? format(reminderDate, 'dd.MM.yyyy') : t('noReminder')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    month={reminderDateMonth}
                    onMonthChange={setReminderDateMonth}
                    selected={reminderDate}
                    onSelect={(date) => { if (date instanceof Date) setReminderDate(date) }}
                  />
                </PopoverContent>
              </Popover>
              {reminderDate && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setReminderDate(undefined); setReminderNote('') }}
                  >
                    {t('clearDate')}
                  </Button>
                  <div className="space-y-2">
                    <Label>{t('reminderNote')}</Label>
                    <Input
                      value={reminderNote}
                      onChange={(e) => setReminderNote(e.target.value)}
                      placeholder={t('reminderNotePlaceholder')}
                      maxLength={500}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Confidential */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="is-confidential"
                checked={isConfidential}
                onCheckedChange={(checked) => setIsConfidential(checked === true)}
              />
              <Label htmlFor="is-confidential" className="cursor-pointer">
                {t('confidential')}
              </Label>
            </div>

            {/* Attachments section — only in edit mode */}
            {isEdit && entry?.id && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-base">{t('attachments')}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="mr-2 h-4 w-4" />
                    )}
                    {t('uploadFile')}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                </div>

                {attachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noAttachments')}</p>
                ) : (
                  <div className="space-y-2">
                    {attachments.map((att: { id: string; filename: string; mimeType: string; sizeBytes: number }) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-3 rounded-md border px-3 py-2"
                      >
                        <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{att.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {(att.sizeBytes / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => handleDownloadAttachment(att.id)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tc('download')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-destructive"
                              onClick={() => handleDeleteAttachment(att.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tc('delete')}</TooltipContent>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('attachmentHint')}
                </p>
              </div>
            )}
          </form>
        </ScrollArea>

        <SheetFooter className="pt-4 border-t">
          <Button
            type="submit"
            form="personnel-file-entry-form"
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? t('save') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

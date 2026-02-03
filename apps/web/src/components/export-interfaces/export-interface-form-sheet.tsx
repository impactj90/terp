'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useCreateExportInterface,
  useUpdateExportInterface,
} from '@/hooks/api/use-export-interfaces'
import type { components } from '@/lib/api/types'

type ExportInterface = components['schemas']['ExportInterface']

interface ExportInterfaceFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: ExportInterface | null
  onSuccess?: () => void
}

interface FormState {
  interfaceNumber: number
  name: string
  mandantNumber: string
  exportScript: string
  exportPath: string
  outputFilename: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  interfaceNumber: 1,
  name: '',
  mandantNumber: '',
  exportScript: '',
  exportPath: '',
  outputFilename: '',
  isActive: true,
}

export function ExportInterfaceFormSheet({
  open,
  onOpenChange,
  item,
  onSuccess,
}: ExportInterfaceFormSheetProps) {
  const t = useTranslations('adminExportInterfaces')
  const isEdit = !!item
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  // Mutations
  const createMutation = useCreateExportInterface()
  const updateMutation = useUpdateExportInterface()

  // Reset form when opening/closing or item changes
  React.useEffect(() => {
    if (open) {
      if (item) {
        setForm({
          interfaceNumber: item.interface_number ?? 1,
          name: item.name || '',
          mandantNumber: item.mandant_number || '',
          exportScript: item.export_script || '',
          exportPath: item.export_path || '',
          outputFilename: item.output_filename || '',
          isActive: item.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, item])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.interfaceNumber || form.interfaceNumber < 1) {
      errors.push(t('validationNumberRequired'))
    }
    if (!form.name.trim()) {
      errors.push(t('validationNameRequired'))
    } else if (form.name.length > 255) {
      errors.push(t('validationNameMaxLength'))
    }
    if (form.mandantNumber.length > 50) {
      errors.push(t('validationMandantMaxLength'))
    }
    if (form.exportScript.length > 255) {
      errors.push(t('validationExportScriptMaxLength'))
    }
    if (form.exportPath.length > 500) {
      errors.push(t('validationExportPathMaxLength'))
    }
    if (form.outputFilename.length > 255) {
      errors.push(t('validationOutputFilenameMaxLength'))
    }

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && item) {
        await updateMutation.mutateAsync({
          path: { id: item.id },
          body: {
            name: form.name.trim(),
            mandant_number: form.mandantNumber.trim() || undefined,
            export_script: form.exportScript.trim() || undefined,
            export_path: form.exportPath.trim() || undefined,
            output_filename: form.outputFilename.trim() || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            interface_number: form.interfaceNumber,
            name: form.name.trim(),
            mandant_number: form.mandantNumber.trim() || undefined,
            export_script: form.exportScript.trim() || undefined,
            export_path: form.exportPath.trim() || undefined,
            output_filename: form.outputFilename.trim() || undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? (isEdit ? t('failedUpdate') : t('failedCreate'))
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editTitle') : t('createTitle')}</SheetTitle>
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
                <Label htmlFor="interfaceNumber">{t('fieldNumber')} *</Label>
                <Input
                  id="interfaceNumber"
                  type="number"
                  value={form.interfaceNumber}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      interfaceNumber: parseInt(e.target.value) || 0,
                    }))
                  }
                  disabled={isSubmitting || isEdit}
                  placeholder={t('numberPlaceholder')}
                  min={1}
                />
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
            </div>

            {/* Export Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionExportConfig')}</h3>

              <div className="space-y-2">
                <Label htmlFor="mandantNumber">{t('fieldMandant')}</Label>
                <Input
                  id="mandantNumber"
                  value={form.mandantNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, mandantNumber: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('mandantPlaceholder')}
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exportScript">{t('fieldExportScript')}</Label>
                <Input
                  id="exportScript"
                  value={form.exportScript}
                  onChange={(e) => setForm((prev) => ({ ...prev, exportScript: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('exportScriptPlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exportPath">{t('fieldExportPath')}</Label>
                <Input
                  id="exportPath"
                  value={form.exportPath}
                  onChange={(e) => setForm((prev) => ({ ...prev, exportPath: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('exportPathPlaceholder')}
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="outputFilename">{t('fieldOutputFilename')}</Label>
                <Input
                  id="outputFilename"
                  value={form.outputFilename}
                  onChange={(e) => setForm((prev) => ({ ...prev, outputFilename: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('outputFilenamePlaceholder')}
                  maxLength={255}
                />
              </div>
            </div>

            {/* Status (edit only) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('columnStatus')}</h3>

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

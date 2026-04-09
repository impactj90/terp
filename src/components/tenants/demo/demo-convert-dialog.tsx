'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useConvertDemoTenant } from '@/hooks'
import type { DemoTenantRow } from './demo-tenants-table'

interface DemoConvertDialogProps {
  demo: DemoTenantRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type DataChoice = 'discard' | 'keep'

export function DemoConvertDialog({ demo, open, onOpenChange }: DemoConvertDialogProps) {
  const t = useTranslations('adminTenants')
  const [choice, setChoice] = React.useState<DataChoice>('discard')
  const convert = useConvertDemoTenant()

  React.useEffect(() => {
    if (open) {
      setChoice('discard')
    }
  }, [open])

  const handleConfirm = () => {
    if (!demo) return
    convert.mutate(
      { tenantId: demo.id, discardData: choice === 'discard' },
      {
        onSuccess: () => {
          toast.success(t('demo.convertDialog.successToast'))
          onOpenChange(false)
        },
        onError: (err) => {
          toast.error(err.message || t('demo.convertDialog.errorToast'))
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('demo.convertDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('demo.convertDialog.description', { name: demo?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={choice}
          onValueChange={(value) => setChoice(value as DataChoice)}
          className="gap-4"
        >
          <div className="flex items-start gap-3 rounded-md border p-3">
            <RadioGroupItem value="discard" id="demo-convert-discard" className="mt-0.5" />
            <div className="grid gap-1">
              <Label htmlFor="demo-convert-discard" className="font-medium">
                {t('demo.convertDialog.discardLabel')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('demo.convertDialog.discardDescription')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border p-3">
            <RadioGroupItem value="keep" id="demo-convert-keep" className="mt-0.5" />
            <div className="grid gap-1">
              <Label htmlFor="demo-convert-keep" className="font-medium">
                {t('demo.convertDialog.keepLabel')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('demo.convertDialog.keepDescription')}
              </p>
            </div>
          </div>
        </RadioGroup>

        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={convert.isPending}
            className="flex-1"
          >
            {t('demo.convertDialog.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={convert.isPending || !demo}
            className="flex-1"
          >
            {convert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('demo.convertDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

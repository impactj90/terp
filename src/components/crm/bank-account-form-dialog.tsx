'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import { useCreateCrmBankAccount, useUpdateCrmBankAccount } from '@/hooks'

interface BankAccountFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId: string
  bankAccount?: {
    id: string
    iban: string
    bic: string | null
    bankName: string | null
    accountHolder: string | null
    isDefault: boolean
  } | null
  onSuccess?: () => void
}

interface FormState {
  iban: string
  bic: string
  bankName: string
  accountHolder: string
  isDefault: boolean
}

const INITIAL_STATE: FormState = {
  iban: '',
  bic: '',
  bankName: '',
  accountHolder: '',
  isDefault: false,
}

export function BankAccountFormDialog({
  open,
  onOpenChange,
  addressId,
  bankAccount,
  onSuccess,
}: BankAccountFormDialogProps) {
  const t = useTranslations('crmAddresses')
  const isEdit = !!bankAccount

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateCrmBankAccount()
  const updateMutation = useUpdateCrmBankAccount()
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  React.useEffect(() => {
    if (open) {
      setError(null)
      if (bankAccount) {
        setForm({
          iban: bankAccount.iban,
          bic: bankAccount.bic || '',
          bankName: bankAccount.bankName || '',
          accountHolder: bankAccount.accountHolder || '',
          isDefault: bankAccount.isDefault,
        })
      } else {
        setForm(INITIAL_STATE)
      }
    }
  }, [open, bankAccount])

  const handleSubmit = async () => {
    setError(null)

    if (!form.iban.trim()) {
      setError(`${t('labelIban')} required`)
      return
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: bankAccount!.id,
          iban: form.iban.trim(),
          bic: form.bic.trim() || null,
          bankName: form.bankName.trim() || null,
          accountHolder: form.accountHolder.trim() || null,
          isDefault: form.isDefault,
        })
      } else {
        await createMutation.mutateAsync({
          addressId,
          iban: form.iban.trim(),
          bic: form.bic.trim() || undefined,
          bankName: form.bankName.trim() || undefined,
          accountHolder: form.accountHolder.trim() || undefined,
          isDefault: form.isDefault,
        })
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('editBankAccountTitle') : t('createBankAccountTitle')}
          </DialogTitle>
          <DialogDescription>{''}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="iban">{t('labelIban')} *</Label>
            <Input
              id="iban"
              value={form.iban}
              onChange={(e) => setForm((p) => ({ ...p, iban: e.target.value }))}
              disabled={isSubmitting}
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bic">{t('labelBic')}</Label>
              <Input
                id="bic"
                value={form.bic}
                onChange={(e) => setForm((p) => ({ ...p, bic: e.target.value }))}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankName">{t('labelBankName')}</Label>
              <Input
                id="bankName"
                value={form.bankName}
                onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountHolder">{t('labelAccountHolder')}</Label>
            <Input
              id="accountHolder"
              value={form.accountHolder}
              onChange={(e) => setForm((p) => ({ ...p, accountHolder: e.target.value }))}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isDefault"
              checked={form.isDefault}
              onCheckedChange={(checked) =>
                setForm((p) => ({ ...p, isDefault: checked === true }))
              }
              disabled={isSubmitting}
            />
            <Label htmlFor="isDefault">{t('labelIsDefault')}</Label>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('save') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

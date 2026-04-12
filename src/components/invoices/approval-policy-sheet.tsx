'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  useCreateApprovalPolicy,
  useUpdateApprovalPolicy,
} from '@/hooks/useApprovalPolicies'
import { useUserGroups } from '@/hooks/use-user-groups'
import { useUsers } from '@/hooks/use-users'

interface ApprovalPolicyData {
  id: string
  amountMin: number
  amountMax: number | null
  stepOrder: number
  approverType: 'group' | 'user'
  approverGroupId: string | null
  approverUserId: string | null
  isActive: boolean
}

interface ApprovalPolicySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editData?: ApprovalPolicyData | null
}

interface FormState {
  amountMin: string
  amountMax: string
  stepOrder: string
  approverType: 'group' | 'user'
  approverGroupId: string
  approverUserId: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  amountMin: '0',
  amountMax: '',
  stepOrder: '1',
  approverType: 'group',
  approverGroupId: '',
  approverUserId: '',
  isActive: true,
}

export function ApprovalPolicySheet({
  open,
  onOpenChange,
  editData,
}: ApprovalPolicySheetProps) {
  const t = useTranslations('inboundInvoices')
  const isEdit = !!editData
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateApprovalPolicy()
  const updateMutation = useUpdateApprovalPolicy()

  const { data: userGroupsData } = useUserGroups({ active: true, enabled: open })
  const { data: usersData } = useUsers({ enabled: open })

  // Extract arrays from hook data — handles both { data: [...] } and direct array shapes
  const rawGroups = userGroupsData as unknown
  const userGroups: Array<{ id: string; name: string }> =
    Array.isArray(rawGroups) ? rawGroups
    : (rawGroups as { data?: unknown[] })?.data as Array<{ id: string; name: string }> ?? []

  const rawUsers = usersData as unknown
  const users: Array<{ id: string; displayName?: string | null; email?: string | null }> =
    Array.isArray(rawUsers) ? rawUsers
    : (rawUsers as { data?: unknown[] })?.data as Array<{ id: string; displayName?: string | null; email?: string | null }> ?? []

  React.useEffect(() => {
    if (open) {
      if (editData) {
        setForm({
          amountMin: String(editData.amountMin ?? 0),
          amountMax: editData.amountMax != null ? String(editData.amountMax) : '',
          stepOrder: String(editData.stepOrder ?? 1),
          approverType: editData.approverType ?? 'group',
          approverGroupId: editData.approverGroupId ?? '',
          approverUserId: editData.approverUserId ?? '',
          isActive: editData.isActive ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, editData])

  function validate(): string | null {
    const min = Number(form.amountMin)
    if (isNaN(min) || form.amountMin.trim() === '') {
      return t('policy.validationAmountMinRequired')
    }
    const stepOrder = Number(form.stepOrder)
    if (isNaN(stepOrder) || stepOrder < 1) {
      return t('policy.validationStepOrderPositive')
    }
    if (form.approverType === 'group' && !form.approverGroupId) {
      return t('policy.validationApproverRequired')
    }
    if (form.approverType === 'user' && !form.approverUserId) {
      return t('policy.validationApproverRequired')
    }
    return null
  }

  async function handleSubmit() {
    setError(null)
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    const payload = {
      amountMin: Number(form.amountMin),
      amountMax: form.amountMax.trim() ? Number(form.amountMax) : null,
      stepOrder: Number(form.stepOrder),
      approverType: form.approverType,
      approverGroupId: form.approverType === 'group' ? form.approverGroupId : null,
      approverUserId: form.approverType === 'user' ? form.approverUserId : null,
      isActive: form.isActive,
    }

    try {
      if (isEdit && editData) {
        await updateMutation.mutateAsync({ id: editData.id, ...payload })
        toast.success(t('policy.updateSuccess'))
      } else {
        await createMutation.mutateAsync(payload)
        toast.success(t('policy.createSuccess'))
      }
      onOpenChange(false)
    } catch (err) {
      const apiError = err as { message?: string }
      setError(apiError.message ?? (isEdit ? t('policy.updateError') : t('policy.createError')))
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? t('policy.editTitle') : t('policy.createTitle')}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? t('policy.editDescription') : t('policy.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Amount range */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('policy.sectionAmountRange')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amountMin">{t('policy.fieldAmountMin')} *</Label>
                  <Input
                    id="amountMin"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.amountMin}
                    onChange={(e) => setForm((prev) => ({ ...prev, amountMin: e.target.value }))}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amountMax">{t('policy.fieldAmountMax')}</Label>
                  <Input
                    id="amountMax"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.amountMax}
                    onChange={(e) => setForm((prev) => ({ ...prev, amountMax: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder={t('policy.amountMaxPlaceholder')}
                  />
                </div>
              </div>
            </div>

            {/* Step order */}
            <div className="space-y-2">
              <Label htmlFor="stepOrder">{t('policy.fieldStepOrder')} *</Label>
              <Input
                id="stepOrder"
                type="number"
                min={1}
                value={form.stepOrder}
                onChange={(e) => setForm((prev) => ({ ...prev, stepOrder: e.target.value }))}
                disabled={isSubmitting}
              />
            </div>

            {/* Approver type */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('policy.sectionApprover')}
              </h3>

              <div className="space-y-2">
                <Label>{t('policy.fieldApproverType')}</Label>
                <Select
                  value={form.approverType}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      approverType: v as 'group' | 'user',
                      approverGroupId: '',
                      approverUserId: '',
                    }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">{t('policy.approverTypeGroup')}</SelectItem>
                    <SelectItem value="user">{t('policy.approverTypeUser')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.approverType === 'group' && (
                <div className="space-y-2">
                  <Label>{t('policy.fieldApproverGroup')} *</Label>
                  <Select
                    value={form.approverGroupId || '__none__'}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        approverGroupId: v === '__none__' ? '' : v,
                      }))
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('policy.selectGroupPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" disabled>
                        {t('policy.selectGroupPlaceholder')}
                      </SelectItem>
                      {userGroups.map((g: { id: string; name: string }) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.approverType === 'user' && (
                <div className="space-y-2">
                  <Label>{t('policy.fieldApproverUser')} *</Label>
                  <Select
                    value={form.approverUserId || '__none__'}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        approverUserId: v === '__none__' ? '' : v,
                      }))
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('policy.selectUserPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" disabled>
                        {t('policy.selectUserPlaceholder')}
                      </SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.displayName ?? u.email ?? u.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Active switch */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">{t('policy.fieldActive')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('policy.fieldActiveDescription')}
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

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            {t('policy.cancelButton')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting
              ? t('policy.saving')
              : isEdit
                ? t('policy.saveChanges')
                : t('policy.createButton')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

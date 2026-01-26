'use client'

import * as React from 'react'
import { Loader2, CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useCreateTariff, useUpdateTariff, useTariff, useWeekPlans } from '@/hooks/api'
import { parseISODate } from '@/lib/time-utils'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']

interface TariffFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tariff?: Tariff | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  weekPlanId: string
  validFrom: Date | undefined
  validTo: Date | undefined
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  weekPlanId: '',
  validFrom: undefined,
  validTo: undefined,
  isActive: true,
}

function validateForm(form: FormState, isEdit: boolean): string[] {
  const errors: string[] = []
  if (!isEdit && !form.code.trim()) errors.push('Code is required')
  if (form.code.length > 20) errors.push('Code must be 20 characters or less')
  if (!form.name.trim()) errors.push('Name is required')
  if (form.name.length > 255) errors.push('Name must be 255 characters or less')
  if (form.validFrom && form.validTo && form.validFrom > form.validTo) {
    errors.push('Valid To must be after Valid From')
  }
  return errors
}

export function TariffFormSheet({
  open,
  onOpenChange,
  tariff,
  onSuccess,
}: TariffFormSheetProps) {
  const isEdit = !!tariff
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [validFromMonth, setValidFromMonth] = React.useState(new Date())
  const [validToMonth, setValidToMonth] = React.useState(new Date())

  // Fetch full tariff details when editing
  const { data: fullTariff } = useTariff(tariff?.id ?? '', open && isEdit)

  // Fetch week plans for selector
  const { data: weekPlansData, isLoading: loadingWeekPlans } = useWeekPlans({
    active: true,
    enabled: open,
  })
  const weekPlans = weekPlansData?.data ?? []

  const createMutation = useCreateTariff()
  const updateMutation = useUpdateTariff()

  // Reset form when opening
  React.useEffect(() => {
    if (open) {
      setError(null)
      if (fullTariff) {
        setForm({
          code: fullTariff.code,
          name: fullTariff.name,
          description: fullTariff.description ?? '',
          weekPlanId: fullTariff.week_plan_id ?? '',
          validFrom: fullTariff.valid_from ? parseISODate(fullTariff.valid_from) : undefined,
          validTo: fullTariff.valid_to ? parseISODate(fullTariff.valid_to) : undefined,
          isActive: fullTariff.is_active ?? true,
        })
      } else if (!isEdit) {
        setForm(INITIAL_STATE)
      }
    }
  }, [open, fullTariff, isEdit])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const errors = validateForm(form, isEdit)
    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && tariff) {
        await updateMutation.mutateAsync({
          path: { id: tariff.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            week_plan_id: form.weekPlanId || undefined,
            valid_from: form.validFrom ? format(form.validFrom, 'yyyy-MM-dd') : undefined,
            valid_to: form.validTo ? format(form.validTo, 'yyyy-MM-dd') : undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            week_plan_id: form.weekPlanId || undefined,
            valid_from: form.validFrom ? format(form.validFrom, 'yyyy-MM-dd') : undefined,
            valid_to: form.validTo ? format(form.validTo, 'yyyy-MM-dd') : undefined,
          },
        })
      }
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? `Failed to ${isEdit ? 'update' : 'create'} tariff`)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Tariff' : 'Create Tariff'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? 'Update tariff settings and week plan assignment.'
              : 'Create a new tariff for employee contracts.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Basic Information</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code *</Label>
                    <Input
                      id="code"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      disabled={isEdit || isPending}
                      placeholder="e.g., TARIFF-001"
                      maxLength={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      disabled={isPending}
                      placeholder="e.g., Standard Full-Time"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    disabled={isPending}
                    placeholder="Optional description..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Week Plan Assignment */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Week Plan</h3>

                <div className="space-y-2">
                  <Label>Assigned Week Plan</Label>
                  <Select
                    value={form.weekPlanId || '__none__'}
                    onValueChange={(value) =>
                      setForm({ ...form, weekPlanId: value === '__none__' ? '' : value })
                    }
                    disabled={isPending || loadingWeekPlans}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select week plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {weekPlans.map((wp) => (
                        <SelectItem key={wp.id} value={wp.id}>
                          {wp.code} - {wp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The week plan defines the employee&apos;s regular schedule
                  </p>
                </div>
              </div>

              {/* Validity Period */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Validity Period</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valid From</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !form.validFrom && 'text-muted-foreground'
                          )}
                          disabled={isPending}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.validFrom ? format(form.validFrom, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          month={validFromMonth}
                          onMonthChange={setValidFromMonth}
                          selected={form.validFrom}
                          onSelect={(date) => setForm({ ...form, validFrom: date as Date | undefined })}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Valid To</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !form.validTo && 'text-muted-foreground'
                          )}
                          disabled={isPending}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.validTo ? format(form.validTo, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          month={validToMonth}
                          onMonthChange={setValidToMonth}
                          selected={form.validTo}
                          onSelect={(date) => setForm({ ...form, validTo: date as Date | undefined })}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty for no time restriction
                </p>
              </div>

              {/* Status */}
              {isEdit && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Status</h3>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isActive">Active</Label>
                      <p className="text-sm text-muted-foreground">
                        Inactive tariffs cannot be assigned to employees
                      </p>
                    </div>
                    <Switch
                      id="isActive"
                      checked={form.isActive}
                      onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                      disabled={isPending}
                    />
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </ScrollArea>

          <SheetFooter className="flex-row gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Tariff'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Plus, Shield, X, MoreHorizontal, Edit, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useVacationCappingRules,
  useCreateVacationCappingRule,
  useUpdateVacationCappingRule,
  useDeleteVacationCappingRule,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { components } from '@/lib/api/types'

type VacationCappingRule = components['schemas']['VacationCappingRule']
type RuleTypeFilter = 'all' | 'year_end' | 'mid_year'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFn = (key: string, values?: Record<string, any>) => string

function useLocalizedMonths() {
  const locale = useLocale()
  return React.useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long' })
    return Array.from({ length: 12 }, (_, i) => formatter.format(new Date(2024, i, 1)))
  }, [locale])
}

interface FormState {
  code: string
  name: string
  description: string
  ruleType: 'year_end' | 'mid_year'
  cutoffMonth: string
  cutoffDay: string
  capValue: string
  isActive: boolean
}

const INITIAL_FORM: FormState = {
  code: '',
  name: '',
  description: '',
  ruleType: 'year_end',
  cutoffMonth: '12',
  cutoffDay: '31',
  capValue: '0',
  isActive: true,
}

export function CappingRulesTab() {
  const t = useTranslations('adminVacationConfig')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['absence_types.manage'])
  const months = useLocalizedMonths()

  const formatCutoffDate = React.useCallback(
    (month: number, day: number) => `${months[month - 1]} ${day}`,
    [months]
  )

  const [search, setSearch] = React.useState('')
  const [ruleTypeFilter, setRuleTypeFilter] = React.useState<RuleTypeFilter>('all')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<VacationCappingRule | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<VacationCappingRule | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const { data: rulesData, isLoading } = useVacationCappingRules({
    enabled: !authLoading && !permLoading && canAccess,
  })
  const deleteMutation = useDeleteVacationCappingRule()
  const items = (rulesData?.data ?? []) as VacationCappingRule[]

  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      if (ruleTypeFilter !== 'all' && item.rule_type !== ruleTypeFilter) return false
      if (search) {
        const s = search.toLowerCase()
        if (!item.code?.toLowerCase().includes(s) && !item.name?.toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [items, search, ruleTypeFilter])

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
      setDeleteItem(null)
    } catch (err) {
      const apiError = err as { status?: number; detail?: string; message?: string }
      setDeleteError(apiError.detail ?? apiError.message ?? t('cappingRule.failedDelete'))
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const hasFilters = Boolean(search) || ruleTypeFilter !== 'all'

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('cappingRule.new')}
        </Button>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('cappingRule.searchPlaceholder')}
          className="w-full sm:w-64"
        />
        <Tabs value={ruleTypeFilter} onValueChange={(v) => setRuleTypeFilter(v as RuleTypeFilter)}>
          <TabsList>
            <TabsTrigger value="all">{t('cappingRule.filterAll')}</TabsTrigger>
            <TabsTrigger value="year_end">{t('cappingRule.ruleTypeYearEnd')}</TabsTrigger>
            <TabsTrigger value="mid_year">{t('cappingRule.ruleTypeMidYear')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setRuleTypeFilter('all') }}>
            <X className="mr-2 h-4 w-4" />
            {t('cappingRule.clearFilters')}
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredItems.length === 1
          ? (t as TranslationFn)('cappingRule.count', { count: filteredItems.length })
          : (t as TranslationFn)('cappingRule.countPlural', { count: filteredItems.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><Skeleton className="h-64" /></div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Shield className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">{t('cappingRule.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {hasFilters ? t('cappingRule.emptyFilterHint') : t('cappingRule.emptyGetStarted')}
              </p>
              {!hasFilters && (
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('cappingRule.addNew')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">{t('cappingRule.columnCode')}</TableHead>
                  <TableHead>{t('cappingRule.columnName')}</TableHead>
                  <TableHead>{t('cappingRule.columnRuleType')}</TableHead>
                  <TableHead>{t('cappingRule.columnCutoffDate')}</TableHead>
                  <TableHead>{t('cappingRule.columnCapValue')}</TableHead>
                  <TableHead>{t('cappingRule.columnStatus')}</TableHead>
                  <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.code}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          item.rule_type === 'year_end'
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                            : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400'
                        }
                      >
                        {item.rule_type === 'year_end' ? t('cappingRule.ruleTypeYearEnd') : t('cappingRule.ruleTypeMidYear')}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCutoffDate(item.cutoff_month, item.cutoff_day)}</TableCell>
                    <TableCell>{item.cap_value}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? 'default' : 'secondary'}>
                        {item.is_active ? t('cappingRule.statusActive') : t('cappingRule.statusInactive')}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditItem(item)}>
                            <Edit className="mr-2 h-4 w-4" />
                            {t('cappingRule.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => { setDeleteItem(item); setDeleteError(null) }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('cappingRule.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CappingRuleFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditItem(null) } }}
        rule={editItem}
        onSuccess={handleFormSuccess}
      />

      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => { if (!open) { setDeleteItem(null); setDeleteError(null) } }}
        title={t('cappingRule.deleteTitle')}
        description={
          deleteError
            ? deleteError
            : deleteItem
              ? (t as TranslationFn)('cappingRule.deleteDescription', { name: deleteItem.name, code: deleteItem.code })
              : ''
        }
        confirmLabel={t('cappingRule.delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

// ==================== Form Sheet ====================

interface CappingRuleFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: VacationCappingRule | null
  onSuccess?: () => void
}

function CappingRuleFormSheet({ open, onOpenChange, rule, onSuccess }: CappingRuleFormSheetProps) {
  const t = useTranslations('adminVacationConfig')
  const months = useLocalizedMonths()
  const isEdit = !!rule
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateVacationCappingRule()
  const updateMutation = useUpdateVacationCappingRule()

  React.useEffect(() => {
    if (!open) return
    if (rule) {
      setForm({
        code: rule.code || '',
        name: rule.name || '',
        description: rule.description || '',
        ruleType: rule.rule_type,
        cutoffMonth: String(rule.cutoff_month),
        cutoffDay: String(rule.cutoff_day),
        capValue: String(rule.cap_value),
        isActive: rule.is_active ?? true,
      })
    } else {
      setForm(INITIAL_FORM)
    }
    setError(null)
  }, [open, rule])

  const handleSubmit = async () => {
    setError(null)
    const errors: string[] = []
    if (!form.code.trim()) errors.push(t('cappingRule.validationCodeRequired'))
    if (!form.name.trim()) errors.push(t('cappingRule.validationNameRequired'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    const cutoffMonth = parseInt(form.cutoffMonth, 10)
    const cutoffDay = parseInt(form.cutoffDay, 10)
    const capValue = parseFloat(form.capValue)

    try {
      if (isEdit && rule) {
        await updateMutation.mutateAsync({
          path: { id: rule.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            rule_type: form.ruleType,
            cutoff_month: cutoffMonth,
            cutoff_day: cutoffDay,
            cap_value: isNaN(capValue) ? 0 : capValue,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            rule_type: form.ruleType,
            cutoff_month: cutoffMonth,
            cutoff_day: cutoffDay,
            cap_value: isNaN(capValue) ? 0 : capValue,
          },
        })
      }
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? (isEdit ? t('cappingRule.failedUpdate') : t('cappingRule.failedCreate')))
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('cappingRule.edit') : t('cappingRule.new')}</SheetTitle>
          <SheetDescription>{isEdit ? t('cappingRule.editDescription') : t('cappingRule.createDescription')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('cappingRule.sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label htmlFor="code">{t('cappingRule.fieldCode')} *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  disabled={isSubmitting || isEdit}
                  placeholder={t('cappingRule.codePlaceholder')}
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">{t('cappingRule.codeHint')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('cappingRule.fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('cappingRule.namePlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ruleType">{t('cappingRule.fieldRuleType')} *</Label>
                <Select
                  value={form.ruleType}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, ruleType: value as 'year_end' | 'mid_year' }))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year_end">{t('cappingRule.ruleTypeYearEnd')}</SelectItem>
                    <SelectItem value="mid_year">{t('cappingRule.ruleTypeMidYear')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('cappingRule.fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('cappingRule.sectionCutoff')}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cutoffMonth">{t('cappingRule.fieldCutoffMonth')}</Label>
                  <Select
                    value={form.cutoffMonth}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, cutoffMonth: value }))}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month, idx) => (
                        <SelectItem key={idx + 1} value={String(idx + 1)}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cutoffDay">{t('cappingRule.fieldCutoffDay')}</Label>
                  <Input
                    id="cutoffDay"
                    type="number"
                    value={form.cutoffDay}
                    onChange={(e) => setForm((prev) => ({ ...prev, cutoffDay: e.target.value }))}
                    disabled={isSubmitting}
                    min={1}
                    max={31}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="capValue">{t('cappingRule.fieldCapValue')} *</Label>
                <Input
                  id="capValue"
                  type="number"
                  value={form.capValue}
                  onChange={(e) => setForm((prev) => ({ ...prev, capValue: e.target.value }))}
                  disabled={isSubmitting}
                  min={0}
                  step={0.5}
                />
                <p className="text-xs text-muted-foreground">{t('cappingRule.capValueHint')}</p>
              </div>
            </div>

            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('cappingRule.sectionStatus')}</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('cappingRule.fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">{t('cappingRule.fieldActiveDescription')}</p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
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
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="flex-1">
            {t('cappingRule.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('cappingRule.saving') : isEdit ? t('cappingRule.saveChanges') : t('cappingRule.create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

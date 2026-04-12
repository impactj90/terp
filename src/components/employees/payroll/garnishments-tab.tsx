'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useEmployeeGarnishments,
  useCreateEmployeeGarnishment,
  useDeleteEmployeeGarnishment,
} from '@/hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any

interface GarnishmentsTabProps {
  employeeId: string
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '---'
  return format(new Date(value), 'dd.MM.yyyy')
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value == null) return '---'
  return `${Number(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`
}

export function GarnishmentsTab({ employeeId }: GarnishmentsTabProps) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeGarnishments(employeeId)
  const createGarnishment = useCreateEmployeeGarnishment()
  const deleteGarnishment = useDeleteEmployeeGarnishment()

  const items = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({
    creditorName: '',
    creditorAddress: '',
    fileReference: '',
    garnishmentAmount: '',
    calculationMethod: 'fixedAmount',
    dependentsCount: '0',
    rank: '1',
    isPAccount: false,
    maintenanceObligation: false,
    startDate: '',
    endDate: '',
  })

  const methodLabels: Record<string, string> = {
    fixedAmount: t('garnishment.fixedAmount'),
    tableBased: t('garnishment.tableBased'),
  }

  function openCreate() {
    setForm({ creditorName: '', creditorAddress: '', fileReference: '', garnishmentAmount: '', calculationMethod: 'fixedAmount', dependentsCount: '0', rank: '1', isPAccount: false, maintenanceObligation: false, startDate: '', endDate: '' })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createGarnishment.mutateAsync({
      employeeId,
      creditorName: form.creditorName,
      creditorAddress: form.creditorAddress || undefined,
      fileReference: form.fileReference || undefined,
      garnishmentAmount: parseFloat(form.garnishmentAmount) || 0,
      calculationMethod: form.calculationMethod,
      dependentsCount: parseInt(form.dependentsCount) || 0,
      rank: parseInt(form.rank) || 1,
      isPAccount: form.isPAccount,
      maintenanceObligation: form.maintenanceObligation,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteGarnishment.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">{t('garnishment.title')}</h3>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t('garnishment.add')}
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t('garnishment.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">{t('garnishment.creditorName')}</th>
                    <th className="pb-2 font-medium">{t('garnishment.garnishmentAmount')}</th>
                    <th className="pb-2 font-medium">{t('garnishment.calculationMethod')}</th>
                    <th className="pb-2 font-medium">{t('garnishment.rank')}</th>
                    <th className="pb-2 font-medium">{t('garnishment.startDate')}</th>
                    <th className="pb-2 font-medium">{t('garnishment.endDate')}</th>
                    <th className="pb-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((g: AnyRecord) => (
                    <tr key={g.id} className="border-b last:border-0">
                      <td className="py-2">{g.creditorName ?? '---'}</td>
                      <td className="py-2">{formatCurrency(g.garnishmentAmount)}</td>
                      <td className="py-2">{methodLabels[g.calculationMethod] ?? g.calculationMethod}</td>
                      <td className="py-2">{g.rank ?? '---'}</td>
                      <td className="py-2">{formatDate(g.startDate)}</td>
                      <td className="py-2">{formatDate(g.endDate)}</td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(g)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent>
              <SheetHeader><SheetTitle>{t('garnishment.add')}</SheetTitle></SheetHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t('garnishment.creditorName')}</Label>
                  <Input value={form.creditorName} onChange={(e) => setForm({ ...form, creditorName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('garnishment.creditorAddress')}</Label>
                  <Input value={form.creditorAddress} onChange={(e) => setForm({ ...form, creditorAddress: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('garnishment.fileReference')}</Label>
                  <Input value={form.fileReference} onChange={(e) => setForm({ ...form, fileReference: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('garnishment.garnishmentAmount')}</Label>
                  <Input type="number" step="0.01" value={form.garnishmentAmount} onChange={(e) => setForm({ ...form, garnishmentAmount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('garnishment.calculationMethod')}</Label>
                  <Select value={form.calculationMethod} onValueChange={(val) => setForm({ ...form, calculationMethod: val })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixedAmount">{t('garnishment.fixedAmount')}</SelectItem>
                      <SelectItem value="tableBased">{t('garnishment.tableBased')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('garnishment.dependentsCount')}</Label>
                  <Input type="number" min="0" value={form.dependentsCount} onChange={(e) => setForm({ ...form, dependentsCount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('garnishment.rank')}</Label>
                  <Input type="number" min="1" value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="isPAccount" checked={form.isPAccount} onCheckedChange={(v) => setForm({ ...form, isPAccount: !!v })} />
                  <Label htmlFor="isPAccount">{t('garnishment.isPAccount')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="maintenanceObligation" checked={form.maintenanceObligation} onCheckedChange={(v) => setForm({ ...form, maintenanceObligation: !!v })} />
                  <Label htmlFor="maintenanceObligation">{t('garnishment.maintenanceObligation')}</Label>
                </div>
                <div className="space-y-2">
                  <Label>{t('garnishment.startDate')}</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('garnishment.endDate')}</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <SheetFooter>
                <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
                <Button onClick={handleSave} disabled={createGarnishment.isPending}>{t('actions.save')}</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('actions.delete')} description={t('actions.confirmDelete')} variant="destructive" isLoading={deleteGarnishment.isPending} onConfirm={handleDelete} />
        </CardContent>
      </Card>
    </div>
  )
}

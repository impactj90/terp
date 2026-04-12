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
import { Checkbox } from '@/components/ui/checkbox'
import {
  useEmployeeForeignAssignments,
  useCreateEmployeeForeignAssignment,
  useDeleteEmployeeForeignAssignment,
} from '@/hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any

interface ForeignAssignmentsTabProps {
  employeeId: string
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '---'
  return format(new Date(value), 'dd.MM.yyyy')
}

export function ForeignAssignmentsTab({ employeeId }: ForeignAssignmentsTabProps) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeForeignAssignments(employeeId)
  const createAssignment = useCreateEmployeeForeignAssignment()
  const deleteAssignment = useDeleteEmployeeForeignAssignment()

  const items = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({
    countryCode: '',
    countryName: '',
    startDate: '',
    endDate: '',
    a1CertificateNumber: '',
    a1ValidFrom: '',
    a1ValidUntil: '',
    foreignActivityExemption: false,
  })

  function openCreate() {
    setForm({ countryCode: '', countryName: '', startDate: '', endDate: '', a1CertificateNumber: '', a1ValidFrom: '', a1ValidUntil: '', foreignActivityExemption: false })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createAssignment.mutateAsync({
      employeeId,
      countryCode: form.countryCode,
      countryName: form.countryName,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      a1CertificateNumber: form.a1CertificateNumber || undefined,
      a1ValidFrom: form.a1ValidFrom || undefined,
      a1ValidUntil: form.a1ValidUntil || undefined,
      foreignActivityExemption: form.foreignActivityExemption,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteAssignment.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">{t('foreignAssignment.title')}</h3>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t('foreignAssignment.add')}
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t('foreignAssignment.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">{t('foreignAssignment.countryName')}</th>
                    <th className="pb-2 font-medium">{t('foreignAssignment.countryCode')}</th>
                    <th className="pb-2 font-medium">{t('foreignAssignment.startDate')}</th>
                    <th className="pb-2 font-medium">{t('foreignAssignment.endDate')}</th>
                    <th className="pb-2 font-medium">{t('foreignAssignment.a1CertificateNumber')}</th>
                    <th className="pb-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((a: AnyRecord) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2">{a.countryName ?? '---'}</td>
                      <td className="py-2">{a.countryCode ?? '---'}</td>
                      <td className="py-2">{formatDate(a.startDate)}</td>
                      <td className="py-2">{formatDate(a.endDate)}</td>
                      <td className="py-2">{a.a1CertificateNumber ?? '---'}</td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(a)}>
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
              <SheetHeader><SheetTitle>{t('foreignAssignment.add')}</SheetTitle></SheetHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t('foreignAssignment.countryCode')}</Label>
                  <Input value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })} placeholder="DE, AT, CH..." maxLength={3} />
                </div>
                <div className="space-y-2">
                  <Label>{t('foreignAssignment.countryName')}</Label>
                  <Input value={form.countryName} onChange={(e) => setForm({ ...form, countryName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('foreignAssignment.startDate')}</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('foreignAssignment.endDate')}</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('foreignAssignment.a1CertificateNumber')}</Label>
                  <Input value={form.a1CertificateNumber} onChange={(e) => setForm({ ...form, a1CertificateNumber: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('foreignAssignment.a1ValidFrom')}</Label>
                  <Input type="date" value={form.a1ValidFrom} onChange={(e) => setForm({ ...form, a1ValidFrom: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('foreignAssignment.a1ValidUntil')}</Label>
                  <Input type="date" value={form.a1ValidUntil} onChange={(e) => setForm({ ...form, a1ValidUntil: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="foreignExemption" checked={form.foreignActivityExemption} onCheckedChange={(v) => setForm({ ...form, foreignActivityExemption: !!v })} />
                  <Label htmlFor="foreignExemption">{t('foreignAssignment.foreignActivityExemption')}</Label>
                </div>
              </div>
              <SheetFooter>
                <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
                <Button onClick={handleSave} disabled={createAssignment.isPending}>{t('actions.save')}</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('actions.delete')} description={t('actions.confirmDelete')} variant="destructive" isLoading={deleteAssignment.isPending} onConfirm={handleDelete} />
        </CardContent>
      </Card>
    </div>
  )
}

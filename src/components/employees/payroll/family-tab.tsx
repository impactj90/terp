'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Edit } from 'lucide-react'
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
  useEmployeeChildren,
  useCreateEmployeeChild,
  useUpdateEmployeeChild,
  useDeleteEmployeeChild,
} from '@/hooks/use-employee-children'
import {
  useEmployeeParentalLeaves,
  useCreateEmployeeParentalLeave,
  useDeleteEmployeeParentalLeave,
} from '@/hooks/use-employee-parental-leaves'
import {
  useEmployeeMaternityLeaves,
  useCreateEmployeeMaternityLeave,
  useDeleteEmployeeMaternityLeave,
} from '@/hooks/use-employee-maternity-leaves'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any

interface FamilyTabProps {
  employeeId: string
  employee: AnyRecord
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '---'
  return format(new Date(value), 'dd.MM.yyyy')
}

// ── Children Section ─────────────────────────────────────────────

function ChildrenSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeChildren(employeeId)
  const createChild = useCreateEmployeeChild()
  const updateChild = useUpdateEmployeeChild()
  const deleteChild = useDeleteEmployeeChild()

  const children = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AnyRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)

  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    taxAllowanceShare: '0.5',
    livesInHousehold: true,
  })

  function openCreate() {
    setEditing(null)
    setForm({ firstName: '', lastName: '', birthDate: '', taxAllowanceShare: '0.5', livesInHousehold: true })
    setSheetOpen(true)
  }

  function openEdit(child: AnyRecord) {
    setEditing(child)
    setForm({
      firstName: child.firstName ?? '',
      lastName: child.lastName ?? '',
      birthDate: child.birthDate ? format(new Date(child.birthDate), 'yyyy-MM-dd') : '',
      taxAllowanceShare: child.taxAllowanceShare != null ? String(child.taxAllowanceShare) : '0.5',
      livesInHousehold: child.livesInHousehold ?? true,
    })
    setSheetOpen(true)
  }

  async function handleSave() {
    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      birthDate: form.birthDate || undefined,
      taxAllowanceShare: parseFloat(form.taxAllowanceShare),
      livesInHousehold: form.livesInHousehold,
    }
    if (editing) {
      await updateChild.mutateAsync({ id: editing.id, ...payload })
    } else {
      await createChild.mutateAsync({ employeeId, ...payload })
    }
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteChild.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('children.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('children.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : children.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('children.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('children.firstName')}</th>
                  <th className="pb-2 font-medium">{t('children.lastName')}</th>
                  <th className="pb-2 font-medium">{t('children.birthDate')}</th>
                  <th className="pb-2 font-medium">{t('children.taxAllowanceShare')}</th>
                  <th className="pb-2 font-medium">{t('children.livesInHousehold')}</th>
                  <th className="pb-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {children.map((child: AnyRecord) => (
                  <tr key={child.id} className="border-b last:border-0">
                    <td className="py-2">{child.firstName}</td>
                    <td className="py-2">{child.lastName}</td>
                    <td className="py-2">{formatDate(child.birthDate)}</td>
                    <td className="py-2">{child.taxAllowanceShare}</td>
                    <td className="py-2">
                      <Badge variant={child.livesInHousehold ? 'default' : 'secondary'}>
                        {child.livesInHousehold ? 'Ja' : 'Nein'}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(child)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(child)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Child form sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{editing ? t('actions.edit') : t('children.add')}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('children.firstName')}</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('children.lastName')}</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('children.birthDate')}</Label>
                <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('children.taxAllowanceShare')}</Label>
                <Input type="number" step="0.5" min="0" value={form.taxAllowanceShare} onChange={(e) => setForm({ ...form, taxAllowanceShare: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="livesInHousehold"
                  checked={form.livesInHousehold}
                  onCheckedChange={(v) => setForm({ ...form, livesInHousehold: !!v })}
                />
                <Label htmlFor="livesInHousehold">{t('children.livesInHousehold')}</Label>
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createChild.isPending || updateChild.isPending}>
                {t('actions.save')}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* Delete confirm */}
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={t('actions.delete')}
          description={t('actions.confirmDelete')}
          variant="destructive"
          isLoading={deleteChild.isPending}
          onConfirm={handleDelete}
        />
      </CardContent>
    </Card>
  )
}

// ── Parental Leave Section ───────────────────────────────────────

function ParentalLeaveSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeParentalLeaves(employeeId)
  const createLeave = useCreateEmployeeParentalLeave()
  const deleteLeave = useDeleteEmployeeParentalLeave()

  const leaves = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({ startDate: '', endDate: '', isPartnerMonths: false })

  function openCreate() {
    setForm({ startDate: '', endDate: '', isPartnerMonths: false })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createLeave.mutateAsync({
      employeeId,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      isPartnerMonths: form.isPartnerMonths,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteLeave.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('parentalLeave.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('parentalLeave.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : leaves.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('parentalLeave.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('parentalLeave.startDate')}</th>
                  <th className="pb-2 font-medium">{t('parentalLeave.endDate')}</th>
                  <th className="pb-2 font-medium">{t('parentalLeave.isPartnerMonths')}</th>
                  <th className="pb-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave: AnyRecord) => (
                  <tr key={leave.id} className="border-b last:border-0">
                    <td className="py-2">{formatDate(leave.startDate)}</td>
                    <td className="py-2">{formatDate(leave.endDate)}</td>
                    <td className="py-2">
                      <Badge variant={leave.isPartnerMonths ? 'default' : 'secondary'}>
                        {leave.isPartnerMonths ? 'Ja' : 'Nein'}
                      </Badge>
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(leave)}>
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
            <SheetHeader>
              <SheetTitle>{t('parentalLeave.add')}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('parentalLeave.startDate')}</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('parentalLeave.endDate')}</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isPartnerMonths"
                  checked={form.isPartnerMonths}
                  onCheckedChange={(v) => setForm({ ...form, isPartnerMonths: !!v })}
                />
                <Label htmlFor="isPartnerMonths">{t('parentalLeave.isPartnerMonths')}</Label>
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createLeave.isPending}>{t('actions.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={t('actions.delete')}
          description={t('actions.confirmDelete')}
          variant="destructive"
          isLoading={deleteLeave.isPending}
          onConfirm={handleDelete}
        />
      </CardContent>
    </Card>
  )
}

// ── Maternity Leave Section ──────────────────────────────────────

function MaternityLeaveSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeMaternityLeaves(employeeId)
  const createLeave = useCreateEmployeeMaternityLeave()
  const deleteLeave = useDeleteEmployeeMaternityLeave()

  const leaves = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({
    startDate: '',
    expectedBirthDate: '',
    actualBirthDate: '',
    actualEndDate: '',
  })

  function openCreate() {
    setForm({ startDate: '', expectedBirthDate: '', actualBirthDate: '', actualEndDate: '' })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createLeave.mutateAsync({
      employeeId,
      startDate: form.startDate,
      expectedBirthDate: form.expectedBirthDate || undefined,
      actualBirthDate: form.actualBirthDate || undefined,
      actualEndDate: form.actualEndDate || undefined,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteLeave.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('maternityLeave.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('maternityLeave.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : leaves.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('maternityLeave.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('maternityLeave.startDate')}</th>
                  <th className="pb-2 font-medium">{t('maternityLeave.expectedBirthDate')}</th>
                  <th className="pb-2 font-medium">{t('maternityLeave.actualBirthDate')}</th>
                  <th className="pb-2 font-medium">{t('maternityLeave.actualEndDate')}</th>
                  <th className="pb-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave: AnyRecord) => (
                  <tr key={leave.id} className="border-b last:border-0">
                    <td className="py-2">{formatDate(leave.startDate)}</td>
                    <td className="py-2">{formatDate(leave.expectedBirthDate)}</td>
                    <td className="py-2">{formatDate(leave.actualBirthDate)}</td>
                    <td className="py-2">{formatDate(leave.actualEndDate)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(leave)}>
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
            <SheetHeader>
              <SheetTitle>{t('maternityLeave.add')}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('maternityLeave.startDate')}</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('maternityLeave.expectedBirthDate')}</Label>
                <Input type="date" value={form.expectedBirthDate} onChange={(e) => setForm({ ...form, expectedBirthDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('maternityLeave.actualBirthDate')}</Label>
                <Input type="date" value={form.actualBirthDate} onChange={(e) => setForm({ ...form, actualBirthDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('maternityLeave.actualEndDate')}</Label>
                <Input type="date" value={form.actualEndDate} onChange={(e) => setForm({ ...form, actualEndDate: e.target.value })} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createLeave.isPending}>{t('actions.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={t('actions.delete')}
          description={t('actions.confirmDelete')}
          variant="destructive"
          isLoading={deleteLeave.isPending}
          onConfirm={handleDelete}
        />
      </CardContent>
    </Card>
  )
}

// ── Parental Allowance Section ───────────────────────────────────

function ParentalAllowanceSection({ employee }: { employee: AnyRecord }) {
  const t = useTranslations('employeePayroll')

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-base font-semibold mb-4">{t('parentalAllowance.title')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t('parentalAllowance.receivesParentalAllowance')}</p>
            <Badge variant={employee?.receivesParentalAllowance ? 'default' : 'secondary'}>
              {employee?.receivesParentalAllowance ? 'Ja' : 'Nein'}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t('parentalAllowance.parentalAllowanceUntil')}</p>
            <p className="text-sm font-medium">{formatDate(employee?.parentalAllowanceUntil)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Family Tab ──────────────────────────────────────────────

export function FamilyTab({ employeeId, employee }: FamilyTabProps) {
  return (
    <div className="space-y-6">
      <ChildrenSection employeeId={employeeId} />
      <ParentalLeaveSection employeeId={employeeId} />
      <MaternityLeaveSection employeeId={employeeId} />
      <ParentalAllowanceSection employee={employee} />
    </div>
  )
}

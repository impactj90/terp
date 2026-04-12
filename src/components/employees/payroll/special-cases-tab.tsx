'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  useEmployeeOtherEmployments,
  useCreateEmployeeOtherEmployment,
  useDeleteEmployeeOtherEmployment,
  useUpdateEmployee,
  useHasPermission,
} from '@/hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any

interface SpecialCasesTabProps {
  employeeId: string
  employee: AnyRecord
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '---'
  return format(new Date(value), 'dd.MM.yyyy')
}

function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return ''
  return new Date(value).toISOString().split('T')[0] ?? ''
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value == null) return '---'
  return `${Number(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '---'}</p>
    </div>
  )
}

// ── Pension Status Card ──────────────────────────────────────────

function PensionStatusSection({ employee, editing, form, setForm }: {
  employee: AnyRecord
  editing: boolean
  form: AnyRecord
  setForm: (f: AnyRecord) => void
}) {
  const t = useTranslations('employeePayroll')

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-base font-semibold mb-4">{t('specialCases.pensionStatus.title')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.pensionStatus.receivesOldAgePension')}</p>
              <div className="flex items-center h-9">
                <Checkbox
                  checked={form.receivesOldAgePension}
                  onCheckedChange={(v) => setForm({ ...form, receivesOldAgePension: !!v })}
                />
                <span className="ml-2 text-sm">{form.receivesOldAgePension ? 'Ja' : 'Nein'}</span>
              </div>
            </div>
          ) : (
            <Field
              label={t('specialCases.pensionStatus.receivesOldAgePension')}
              value={
                employee?.receivesOldAgePension != null ? (
                  <Badge variant={employee.receivesOldAgePension ? 'default' : 'secondary'}>
                    {employee.receivesOldAgePension ? 'Ja' : 'Nein'}
                  </Badge>
                ) : null
              }
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.pensionStatus.receivesDisabilityPension')}</p>
              <div className="flex items-center h-9">
                <Checkbox
                  checked={form.receivesDisabilityPension}
                  onCheckedChange={(v) => setForm({ ...form, receivesDisabilityPension: !!v })}
                />
                <span className="ml-2 text-sm">{form.receivesDisabilityPension ? 'Ja' : 'Nein'}</span>
              </div>
            </div>
          ) : (
            <Field
              label={t('specialCases.pensionStatus.receivesDisabilityPension')}
              value={
                employee?.receivesDisabilityPension != null ? (
                  <Badge variant={employee.receivesDisabilityPension ? 'default' : 'secondary'}>
                    {employee.receivesDisabilityPension ? 'Ja' : 'Nein'}
                  </Badge>
                ) : null
              }
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.pensionStatus.receivesSurvivorPension')}</p>
              <div className="flex items-center h-9">
                <Checkbox
                  checked={form.receivesSurvivorPension}
                  onCheckedChange={(v) => setForm({ ...form, receivesSurvivorPension: !!v })}
                />
                <span className="ml-2 text-sm">{form.receivesSurvivorPension ? 'Ja' : 'Nein'}</span>
              </div>
            </div>
          ) : (
            <Field
              label={t('specialCases.pensionStatus.receivesSurvivorPension')}
              value={
                employee?.receivesSurvivorPension != null ? (
                  <Badge variant={employee.receivesSurvivorPension ? 'default' : 'secondary'}>
                    {employee.receivesSurvivorPension ? 'Ja' : 'Nein'}
                  </Badge>
                ) : null
              }
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.pensionStatus.pensionStartDate')}</p>
              <Input
                type="date"
                value={form.pensionStartDate}
                onChange={(e) => setForm({ ...form, pensionStartDate: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.pensionStatus.pensionStartDate')}
              value={formatDate(employee?.pensionStartDate)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── BG Data Card ─────────────────────────────────────────────────

function BgDataSection({ employee, editing, form, setForm }: {
  employee: AnyRecord
  editing: boolean
  form: AnyRecord
  setForm: (f: AnyRecord) => void
}) {
  const t = useTranslations('employeePayroll')

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-base font-semibold mb-4">{t('specialCases.bgData.title')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.bgData.bgInstitution')}</p>
              <Input
                value={form.bgInstitution}
                onChange={(e) => setForm({ ...form, bgInstitution: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.bgData.bgInstitution')}
              value={employee?.bgInstitution}
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.bgData.bgMembershipNumber')}</p>
              <Input
                value={form.bgMembershipNumber}
                onChange={(e) => setForm({ ...form, bgMembershipNumber: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.bgData.bgMembershipNumber')}
              value={employee?.bgMembershipNumber}
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.bgData.bgHazardTariff')}</p>
              <Input
                value={form.bgHazardTariff}
                onChange={(e) => setForm({ ...form, bgHazardTariff: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.bgData.bgHazardTariff')}
              value={employee?.bgHazardTariff}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Other Employment Table ───────────────────────────────────────

function OtherEmploymentSection({ employeeId }: { employeeId: string }) {
  const t = useTranslations('employeePayroll')
  const { data, isLoading } = useEmployeeOtherEmployments(employeeId)
  const createEmployment = useCreateEmployeeOtherEmployment()
  const deleteEmployment = useDeleteEmployeeOtherEmployment()

  const items = data ?? []

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<AnyRecord | null>(null)
  const [form, setForm] = React.useState({
    employerName: '',
    monthlyIncome: '',
    weeklyHours: '',
    isMinijob: false,
    startDate: '',
    endDate: '',
  })

  function openCreate() {
    setForm({ employerName: '', monthlyIncome: '', weeklyHours: '', isMinijob: false, startDate: '', endDate: '' })
    setSheetOpen(true)
  }

  async function handleSave() {
    await createEmployment.mutateAsync({
      employeeId,
      employerName: form.employerName,
      monthlyIncome: parseFloat(form.monthlyIncome) || 0,
      weeklyHours: parseFloat(form.weeklyHours) || undefined,
      isMinijob: form.isMinijob,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
    })
    setSheetOpen(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteEmployment.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{t('specialCases.otherEmployment.title')}</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('specialCases.otherEmployment.add')}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('specialCases.otherEmployment.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t('specialCases.otherEmployment.employerName')}</th>
                  <th className="pb-2 font-medium">{t('specialCases.otherEmployment.monthlyIncome')}</th>
                  <th className="pb-2 font-medium">{t('specialCases.otherEmployment.weeklyHours')}</th>
                  <th className="pb-2 font-medium">{t('specialCases.otherEmployment.isMinijob')}</th>
                  <th className="pb-2 font-medium">{t('specialCases.otherEmployment.startDate')}</th>
                  <th className="pb-2 font-medium">{t('specialCases.otherEmployment.endDate')}</th>
                  <th className="pb-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {items.map((emp: AnyRecord) => (
                  <tr key={emp.id} className="border-b last:border-0">
                    <td className="py-2">{emp.employerName ?? '---'}</td>
                    <td className="py-2">{formatCurrency(emp.monthlyIncome)}</td>
                    <td className="py-2">{emp.weeklyHours != null ? `${emp.weeklyHours}h` : '---'}</td>
                    <td className="py-2">
                      <Badge variant={emp.isMinijob ? 'default' : 'secondary'}>
                        {emp.isMinijob ? 'Ja' : 'Nein'}
                      </Badge>
                    </td>
                    <td className="py-2">{formatDate(emp.startDate)}</td>
                    <td className="py-2">{formatDate(emp.endDate)}</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(emp)}>
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
            <SheetHeader><SheetTitle>{t('specialCases.otherEmployment.add')}</SheetTitle></SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('specialCases.otherEmployment.employerName')}</Label>
                <Input value={form.employerName} onChange={(e) => setForm({ ...form, employerName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('specialCases.otherEmployment.monthlyIncome')}</Label>
                <Input type="number" step="0.01" value={form.monthlyIncome} onChange={(e) => setForm({ ...form, monthlyIncome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('specialCases.otherEmployment.weeklyHours')}</Label>
                <Input type="number" step="0.5" value={form.weeklyHours} onChange={(e) => setForm({ ...form, weeklyHours: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="oe-isMinijob" checked={form.isMinijob} onCheckedChange={(v) => setForm({ ...form, isMinijob: !!v })} />
                <Label htmlFor="oe-isMinijob">{t('specialCases.otherEmployment.isMinijob')}</Label>
              </div>
              <div className="space-y-2">
                <Label>{t('specialCases.otherEmployment.startDate')}</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('specialCases.otherEmployment.endDate')}</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={handleSave} disabled={createEmployment.isPending}>{t('actions.save')}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} title={t('actions.delete')} description={t('actions.confirmDelete')} variant="destructive" isLoading={deleteEmployment.isPending} onConfirm={handleDelete} />
      </CardContent>
    </Card>
  )
}

// ── Student / Apprentice Data Card ───────────────────────────────

function StudentDataSection({ employee, editing, form, setForm }: {
  employee: AnyRecord
  editing: boolean
  form: AnyRecord
  setForm: (f: AnyRecord) => void
}) {
  const t = useTranslations('employeePayroll')

  const pgCode = employee?.personnelGroupCode
  const isStudentOrApprentice =
    pgCode === '102' || pgCode === '105' || pgCode === '106' ||
    pgCode === 102 || pgCode === 105 || pgCode === 106

  if (!isStudentOrApprentice) return null

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-base font-semibold mb-4">{t('specialCases.studentData.title')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.studentData.university')}</p>
              <Input
                value={form.university}
                onChange={(e) => setForm({ ...form, university: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.studentData.university')}
              value={employee?.university}
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.studentData.studentId')}</p>
              <Input
                value={form.studentId}
                onChange={(e) => setForm({ ...form, studentId: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.studentData.studentId')}
              value={employee?.studentId}
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.studentData.fieldOfStudy')}</p>
              <Input
                value={form.fieldOfStudy}
                onChange={(e) => setForm({ ...form, fieldOfStudy: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.studentData.fieldOfStudy')}
              value={employee?.fieldOfStudy}
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.studentData.apprenticeshipOccupation')}</p>
              <Input
                value={form.apprenticeshipOccupation}
                onChange={(e) => setForm({ ...form, apprenticeshipOccupation: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.studentData.apprenticeshipOccupation')}
              value={employee?.apprenticeshipOccupation}
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.studentData.apprenticeshipExternalCompany')}</p>
              <Input
                value={form.apprenticeshipExternalCompany}
                onChange={(e) => setForm({ ...form, apprenticeshipExternalCompany: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.studentData.apprenticeshipExternalCompany')}
              value={employee?.apprenticeshipExternalCompany}
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.studentData.vocationalSchool')}</p>
              <Input
                value={form.vocationalSchool}
                onChange={(e) => setForm({ ...form, vocationalSchool: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.studentData.vocationalSchool')}
              value={employee?.vocationalSchool}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Death / Bereavement Card ─────────────────────────────────────

function DeathSection({ employee, editing, form, setForm }: {
  employee: AnyRecord
  editing: boolean
  form: AnyRecord
  setForm: (f: AnyRecord) => void
}) {
  const t = useTranslations('employeePayroll')

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-base font-semibold mb-4">{t('specialCases.death.title')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.death.dateOfDeath')}</p>
              <Input
                type="date"
                value={form.dateOfDeath}
                onChange={(e) => setForm({ ...form, dateOfDeath: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.death.dateOfDeath')}
              value={formatDate(employee?.dateOfDeath)}
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.death.heirName')}</p>
              <Input
                value={form.heirName}
                onChange={(e) => setForm({ ...form, heirName: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.death.heirName')}
              value={employee?.heirName}
            />
          )}

          {editing ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('specialCases.death.heirIban')}</p>
              <Input
                value={form.heirIban}
                onChange={(e) => setForm({ ...form, heirIban: e.target.value })}
              />
            </div>
          ) : (
            <Field
              label={t('specialCases.death.heirIban')}
              value={employee?.heirIban}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Special Cases Tab ───────────────────────────────────────

export function SpecialCasesTab({ employeeId, employee }: SpecialCasesTabProps) {
  const updateEmployee = useUpdateEmployee()
  const { allowed: canEdit } = useHasPermission(['personnel.payroll_data.edit'])

  const [editing, setEditing] = React.useState(false)
  const [form, setForm] = React.useState({
    receivesOldAgePension: false,
    receivesDisabilityPension: false,
    receivesSurvivorPension: false,
    pensionStartDate: '',
    bgInstitution: '',
    bgMembershipNumber: '',
    bgHazardTariff: '',
    university: '',
    studentId: '',
    fieldOfStudy: '',
    apprenticeshipOccupation: '',
    apprenticeshipExternalCompany: '',
    vocationalSchool: '',
    dateOfDeath: '',
    heirName: '',
    heirIban: '',
  })

  function enterEditMode() {
    setForm({
      receivesOldAgePension: employee?.receivesOldAgePension ?? false,
      receivesDisabilityPension: employee?.receivesDisabilityPension ?? false,
      receivesSurvivorPension: employee?.receivesSurvivorPension ?? false,
      pensionStartDate: toDateInputValue(employee?.pensionStartDate),
      bgInstitution: employee?.bgInstitution ?? '',
      bgMembershipNumber: employee?.bgMembershipNumber ?? '',
      bgHazardTariff: employee?.bgHazardTariff ?? '',
      university: employee?.university ?? '',
      studentId: employee?.studentId ?? '',
      fieldOfStudy: employee?.fieldOfStudy ?? '',
      apprenticeshipOccupation: employee?.apprenticeshipOccupation ?? '',
      apprenticeshipExternalCompany: employee?.apprenticeshipExternalCompany ?? '',
      vocationalSchool: employee?.vocationalSchool ?? '',
      dateOfDeath: toDateInputValue(employee?.dateOfDeath),
      heirName: employee?.heirName ?? '',
      heirIban: employee?.heirIban ?? '',
    })
    setEditing(true)
  }

  async function handleSave() {
    await updateEmployee.mutateAsync({
      id: employeeId,
      receivesOldAgePension: form.receivesOldAgePension,
      receivesDisabilityPension: form.receivesDisabilityPension,
      receivesSurvivorPension: form.receivesSurvivorPension,
      pensionStartDate: form.pensionStartDate || null,
      bgInstitution: form.bgInstitution || null,
      bgMembershipNumber: form.bgMembershipNumber || null,
      bgHazardTariff: form.bgHazardTariff || null,
      university: form.university || null,
      studentId: form.studentId || null,
      fieldOfStudy: form.fieldOfStudy || null,
      apprenticeshipOccupation: form.apprenticeshipOccupation || null,
      apprenticeshipExternalCompany: form.apprenticeshipExternalCompany || null,
      vocationalSchool: form.vocationalSchool || null,
      dateOfDeath: form.dateOfDeath || null,
      heirName: form.heirName || null,
      heirIban: form.heirIban || null,
    })
    setEditing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {!editing && canEdit && (
          <Button variant="outline" size="sm" onClick={enterEditMode}>
            Bearbeiten
          </Button>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateEmployee.isPending}>
              Speichern
            </Button>
          </div>
        )}
      </div>

      <PensionStatusSection employee={employee} editing={editing} form={form} setForm={setForm} />
      <BgDataSection employee={employee} editing={editing} form={form} setForm={setForm} />
      <OtherEmploymentSection employeeId={employeeId} />
      <StudentDataSection employee={employee} editing={editing} form={form} setForm={setForm} />
      <DeathSection employee={employee} editing={editing} form={form} setForm={setForm} />
    </div>
  )
}

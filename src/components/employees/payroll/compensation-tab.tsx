'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUpdateEmployee, useHasPermission } from '@/hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Employee = any

interface CompensationTabProps {
  employeeId: string
  employee: Employee
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '---'}</p>
    </div>
  )
}

export function CompensationTab({ employeeId, employee }: CompensationTabProps) {
  const t = useTranslations('employeePayroll')
  const updateEmployee = useUpdateEmployee()
  const { allowed: canEdit } = useHasPermission(['personnel.payroll_data.edit'])

  const [editing, setEditing] = React.useState(false)
  const [form, setForm] = React.useState({
    paymentType: '',
    grossSalary: '',
    hourlyRate: '',
    salaryGroup: '',
    houseNumber: '',
    contractType: '',
    probationMonths: '',
    noticePeriodEmployee: '',
    noticePeriodEmployer: '',
  })

  function enterEditMode() {
    setForm({
      paymentType: employee?.paymentType ?? '',
      grossSalary: employee?.grossSalary != null ? String(employee.grossSalary) : '',
      hourlyRate: employee?.hourlyRate != null ? String(employee.hourlyRate) : '',
      salaryGroup: employee?.salaryGroup ?? '',
      houseNumber: employee?.houseNumber ?? '',
      contractType: employee?.contractType ?? '',
      probationMonths: employee?.probationMonths != null ? String(employee.probationMonths) : '',
      noticePeriodEmployee: employee?.noticePeriodEmployee ?? '',
      noticePeriodEmployer: employee?.noticePeriodEmployer ?? '',
    })
    setEditing(true)
  }

  async function handleSave() {
    await updateEmployee.mutateAsync({
      id: employeeId,
      paymentType: form.paymentType || null,
      grossSalary: form.grossSalary ? parseFloat(form.grossSalary) : null,
      hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null,
      salaryGroup: form.salaryGroup || null,
      houseNumber: form.houseNumber || null,
      contractType: form.contractType || null,
      probationMonths: form.probationMonths ? parseInt(form.probationMonths) : null,
      noticePeriodEmployee: form.noticePeriodEmployee || null,
      noticePeriodEmployer: form.noticePeriodEmployer || null,
    })
    setEditing(false)
  }

  const paymentTypeLabels: Record<string, string> = {
    monthlySalary: t('compensation.monthlySalary'),
    hourlyWage: t('compensation.hourlyWage'),
    commission: t('compensation.commission'),
  }

  const contractTypeLabels: Record<string, string> = {
    permanent: t('compensation.contractPermanent'),
    fixedNoReason: t('compensation.contractFixedNoReason'),
    fixedWithReason: t('compensation.contractFixedWithReason'),
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">{t('compensation.title')}</h3>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('compensation.paymentType')}</p>
                <Select value={form.paymentType} onValueChange={(val) => setForm({ ...form, paymentType: val === '__empty__' ? '' : val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="---" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">---</SelectItem>
                    <SelectItem value="monthlySalary">{paymentTypeLabels.monthlySalary}</SelectItem>
                    <SelectItem value="hourlyWage">{paymentTypeLabels.hourlyWage}</SelectItem>
                    <SelectItem value="commission">{paymentTypeLabels.commission}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Field
                label={t('compensation.paymentType')}
                value={
                  employee?.paymentType
                    ? paymentTypeLabels[employee.paymentType] ?? employee.paymentType
                    : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('compensation.grossSalary')}</p>
                <Input
                  type="number"
                  step="0.01"
                  value={form.grossSalary}
                  onChange={(e) => setForm({ ...form, grossSalary: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('compensation.grossSalary')}
                value={
                  employee?.grossSalary != null
                    ? `${Number(employee.grossSalary).toFixed(2)} EUR`
                    : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('compensation.hourlyRate')}</p>
                <Input
                  type="number"
                  step="0.01"
                  value={form.hourlyRate}
                  onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('compensation.hourlyRate')}
                value={
                  employee?.hourlyRate != null
                    ? `${Number(employee.hourlyRate).toFixed(2)} EUR`
                    : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('compensation.salaryGroup')}</p>
                <Input
                  value={form.salaryGroup}
                  onChange={(e) => setForm({ ...form, salaryGroup: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('compensation.salaryGroup')}
                value={employee?.salaryGroup}
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('compensation.houseNumber')}</p>
                <Input
                  value={form.houseNumber}
                  onChange={(e) => setForm({ ...form, houseNumber: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('compensation.houseNumber')}
                value={employee?.houseNumber}
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('compensation.contractType')}</p>
                <Select value={form.contractType} onValueChange={(val) => setForm({ ...form, contractType: val === '__empty__' ? '' : val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="---" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">---</SelectItem>
                    <SelectItem value="permanent">{contractTypeLabels.permanent}</SelectItem>
                    <SelectItem value="fixedNoReason">{contractTypeLabels.fixedNoReason}</SelectItem>
                    <SelectItem value="fixedWithReason">{contractTypeLabels.fixedWithReason}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Field
                label={t('compensation.contractType')}
                value={
                  employee?.contractType
                    ? contractTypeLabels[employee.contractType] ?? employee.contractType
                    : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('compensation.probationMonths')}</p>
                <Input
                  type="number"
                  value={form.probationMonths}
                  onChange={(e) => setForm({ ...form, probationMonths: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('compensation.probationMonths')}
                value={
                  employee?.probationMonths != null
                    ? String(employee.probationMonths)
                    : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('compensation.noticePeriodEmployee')}</p>
                <Input
                  value={form.noticePeriodEmployee}
                  onChange={(e) => setForm({ ...form, noticePeriodEmployee: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('compensation.noticePeriodEmployee')}
                value={employee?.noticePeriodEmployee}
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('compensation.noticePeriodEmployer')}</p>
                <Input
                  value={form.noticePeriodEmployer}
                  onChange={(e) => setForm({ ...form, noticePeriodEmployer: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('compensation.noticePeriodEmployer')}
                value={employee?.noticePeriodEmployer}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

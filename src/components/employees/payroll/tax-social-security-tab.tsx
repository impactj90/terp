'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useUpdateEmployee, useHasPermission } from '@/hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Employee = any

interface TaxSocialSecurityTabProps {
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

function maskValue(value: string | null | undefined): string {
  if (!value) return '---'
  if (value.length <= 4) return value
  return '*'.repeat(value.length - 4) + value.slice(-4)
}

export function TaxSocialSecurityTab({ employeeId, employee }: TaxSocialSecurityTabProps) {
  const t = useTranslations('employeePayroll')
  const updateEmployee = useUpdateEmployee()
  const { allowed: canEdit } = useHasPermission(['personnel.payroll_data.edit'])

  const [editing, setEditing] = React.useState(false)
  const [form, setForm] = React.useState({
    taxId: '',
    taxClass: '',
    taxFactor: '',
    childTaxAllowance: '',
    denomination: '',
    spouseDenomination: '',
    payrollTaxAllowance: '',
    payrollTaxAddition: '',
    isPrimaryEmployer: false,
    birthName: '',
    socialSecurityNumber: '',
    healthInsuranceProviderId: '',
    healthInsuranceStatus: '',
    privateHealthInsuranceContribution: '',
    personnelGroupCode: '',
    contributionGroupCode: '',
    activityCode: '',
    midijobFlag: '',
    umlageU1: false,
    umlageU2: false,
  })

  function enterEditMode() {
    setForm({
      taxId: employee?.taxId ?? '',
      taxClass: employee?.taxClass != null ? String(employee.taxClass) : '',
      taxFactor: employee?.taxFactor != null ? String(employee.taxFactor) : '',
      childTaxAllowance: employee?.childTaxAllowance != null ? String(employee.childTaxAllowance) : '',
      denomination: employee?.denomination ?? '',
      spouseDenomination: employee?.spouseDenomination ?? '',
      payrollTaxAllowance: employee?.payrollTaxAllowance != null ? String(employee.payrollTaxAllowance) : '',
      payrollTaxAddition: employee?.payrollTaxAddition != null ? String(employee.payrollTaxAddition) : '',
      isPrimaryEmployer: employee?.isPrimaryEmployer ?? false,
      birthName: employee?.birthName ?? '',
      socialSecurityNumber: employee?.socialSecurityNumber ?? '',
      healthInsuranceProviderId: employee?.healthInsuranceProviderId ?? '',
      healthInsuranceStatus: employee?.healthInsuranceStatus ?? '',
      privateHealthInsuranceContribution: employee?.privateHealthInsuranceContribution != null ? String(employee.privateHealthInsuranceContribution) : '',
      personnelGroupCode: employee?.personnelGroupCode ?? '',
      contributionGroupCode: employee?.contributionGroupCode ?? '',
      activityCode: employee?.activityCode ?? '',
      midijobFlag: employee?.midijobFlag != null ? String(employee.midijobFlag) : '',
      umlageU1: employee?.umlageU1 ?? false,
      umlageU2: employee?.umlageU2 ?? false,
    })
    setEditing(true)
  }

  async function handleSave() {
    await updateEmployee.mutateAsync({
      id: employeeId,
      taxId: form.taxId || null,
      taxClass: form.taxClass ? parseInt(form.taxClass) : null,
      taxFactor: form.taxFactor ? parseFloat(form.taxFactor) : null,
      childTaxAllowance: form.childTaxAllowance ? parseFloat(form.childTaxAllowance) : null,
      denomination: form.denomination || null,
      spouseDenomination: form.spouseDenomination || null,
      payrollTaxAllowance: form.payrollTaxAllowance ? parseFloat(form.payrollTaxAllowance) : null,
      payrollTaxAddition: form.payrollTaxAddition ? parseFloat(form.payrollTaxAddition) : null,
      isPrimaryEmployer: form.isPrimaryEmployer,
      birthName: form.birthName || null,
      socialSecurityNumber: form.socialSecurityNumber || null,
      healthInsuranceProviderId: form.healthInsuranceProviderId || null,
      healthInsuranceStatus: form.healthInsuranceStatus || null,
      privateHealthInsuranceContribution: form.privateHealthInsuranceContribution ? parseFloat(form.privateHealthInsuranceContribution) : null,
      personnelGroupCode: form.personnelGroupCode || null,
      contributionGroupCode: form.contributionGroupCode || null,
      activityCode: form.activityCode || null,
      midijobFlag: form.midijobFlag !== '' ? parseInt(form.midijobFlag) : null,
      umlageU1: form.umlageU1,
      umlageU2: form.umlageU2,
    })
    setEditing(false)
  }

  const denominationKeys: Record<string, string> = {
    ev: 'denomination.ev',
    rk: 'denomination.rk',
    la: 'denomination.la',
    er: 'denomination.er',
    lt: 'denomination.lt',
    rf: 'denomination.rf',
    fg: 'denomination.fg',
    fr: 'denomination.fr',
    fs: 'denomination.fs',
    fa: 'denomination.fa',
    ak: 'denomination.ak',
    ib: 'denomination.ib',
    jd: 'denomination.jd',
  }

  function denominationLabel(code: string | null | undefined): string {
    if (!code) return '---'
    const key = denominationKeys[code]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return key ? t(key as any) : code
  }

  const midijobLabels: Record<string, string> = {
    '0': t('socialSecurity.midijobNo'),
    '1': t('socialSecurity.midijobGleitzone'),
    '2': t('socialSecurity.midijobMidijob'),
  }

  const healthStatusLabels: Record<string, string> = {
    mandatory: t('socialSecurity.statusMandatory'),
    voluntary: t('socialSecurity.statusVoluntary'),
    private: t('socialSecurity.statusPrivate'),
  }

  const showTaxFactor = editing ? form.taxClass === '4' : employee?.taxClass === 4
  const showPrivateContribution = editing
    ? form.healthInsuranceStatus === 'private'
    : employee?.healthInsuranceStatus === 'private'

  return (
    <div className="space-y-6">
      {/* Tax Data Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">{t('tax.title')}</h3>
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
                <p className="text-sm text-muted-foreground">{t('tax.taxId')}</p>
                <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
              </div>
            ) : (
              <Field label={t('tax.taxId')} value={maskValue(employee?.taxId)} />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('tax.taxClass')}</p>
                <Select value={form.taxClass} onValueChange={(val) => setForm({ ...form, taxClass: val === '__empty__' ? '' : val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="---" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">---</SelectItem>
                    {['1', '2', '3', '4', '5', '6'].map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Field
                label={t('tax.taxClass')}
                value={employee?.taxClass != null ? String(employee.taxClass) : null}
              />
            )}

            {showTaxFactor && (
              editing ? (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('tax.taxFactor')}</p>
                  <Input
                    type="number"
                    step="0.001"
                    value={form.taxFactor}
                    onChange={(e) => setForm({ ...form, taxFactor: e.target.value })}
                  />
                </div>
              ) : (
                <Field
                  label={t('tax.taxFactor')}
                  value={employee?.taxFactor != null ? String(employee.taxFactor) : null}
                />
              )
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('tax.childTaxAllowance')}</p>
                <Input
                  type="number"
                  step="0.5"
                  value={form.childTaxAllowance}
                  onChange={(e) => setForm({ ...form, childTaxAllowance: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('tax.childTaxAllowance')}
                value={
                  employee?.childTaxAllowance != null
                    ? String(employee.childTaxAllowance)
                    : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('tax.denomination')}</p>
                <Select value={form.denomination} onValueChange={(val) => setForm({ ...form, denomination: val === '__empty__' ? '' : val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="---" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">---</SelectItem>
                    {Object.keys(denominationKeys).map((code) => (
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      <SelectItem key={code} value={code}>{t(denominationKeys[code] as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Field
                label={t('tax.denomination')}
                value={denominationLabel(employee?.denomination)}
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('tax.spouseDenomination')}</p>
                <Select value={form.spouseDenomination} onValueChange={(val) => setForm({ ...form, spouseDenomination: val === '__empty__' ? '' : val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="---" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">---</SelectItem>
                    {Object.keys(denominationKeys).map((code) => (
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      <SelectItem key={code} value={code}>{t(denominationKeys[code] as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Field
                label={t('tax.spouseDenomination')}
                value={denominationLabel(employee?.spouseDenomination)}
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('tax.payrollTaxAllowance')}</p>
                <Input
                  type="number"
                  step="0.01"
                  value={form.payrollTaxAllowance}
                  onChange={(e) => setForm({ ...form, payrollTaxAllowance: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('tax.payrollTaxAllowance')}
                value={
                  employee?.payrollTaxAllowance != null
                    ? `${Number(employee.payrollTaxAllowance).toFixed(2)} EUR`
                    : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('tax.payrollTaxAddition')}</p>
                <Input
                  type="number"
                  step="0.01"
                  value={form.payrollTaxAddition}
                  onChange={(e) => setForm({ ...form, payrollTaxAddition: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('tax.payrollTaxAddition')}
                value={
                  employee?.payrollTaxAddition != null
                    ? `${Number(employee.payrollTaxAddition).toFixed(2)} EUR`
                    : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('tax.isPrimaryEmployer')}</p>
                <div className="flex items-center h-9">
                  <Checkbox
                    checked={form.isPrimaryEmployer}
                    onCheckedChange={(v) => setForm({ ...form, isPrimaryEmployer: !!v })}
                  />
                  <span className="ml-2 text-sm">{form.isPrimaryEmployer ? 'Ja' : 'Nein'}</span>
                </div>
              </div>
            ) : (
              <Field
                label={t('tax.isPrimaryEmployer')}
                value={
                  employee?.isPrimaryEmployer != null ? (
                    <Badge variant={employee.isPrimaryEmployer ? 'default' : 'secondary'}>
                      {employee.isPrimaryEmployer ? 'Ja' : 'Nein'}
                    </Badge>
                  ) : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('tax.birthName')}</p>
                <Input value={form.birthName} onChange={(e) => setForm({ ...form, birthName: e.target.value })} />
              </div>
            ) : (
              <Field label={t('tax.birthName')} value={employee?.birthName} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Social Security Card */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-base font-semibold mb-4">{t('socialSecurity.title')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('socialSecurity.socialSecurityNumber')}</p>
                <Input
                  value={form.socialSecurityNumber}
                  onChange={(e) => setForm({ ...form, socialSecurityNumber: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('socialSecurity.socialSecurityNumber')}
                value={maskValue(employee?.socialSecurityNumber)}
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('socialSecurity.healthInsuranceProvider')}</p>
                <Input
                  value={form.healthInsuranceProviderId}
                  onChange={(e) => setForm({ ...form, healthInsuranceProviderId: e.target.value })}
                  placeholder="Provider ID"
                />
              </div>
            ) : (
              <Field
                label={t('socialSecurity.healthInsuranceProvider')}
                value={employee?.healthInsuranceProvider}
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('socialSecurity.healthInsuranceStatus')}</p>
                <Select value={form.healthInsuranceStatus} onValueChange={(val) => setForm({ ...form, healthInsuranceStatus: val === '__empty__' ? '' : val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="---" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">---</SelectItem>
                    <SelectItem value="mandatory">{healthStatusLabels.mandatory}</SelectItem>
                    <SelectItem value="voluntary">{healthStatusLabels.voluntary}</SelectItem>
                    <SelectItem value="private">{healthStatusLabels.private}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Field
                label={t('socialSecurity.healthInsuranceStatus')}
                value={healthStatusLabels[employee?.healthInsuranceStatus] ?? employee?.healthInsuranceStatus}
              />
            )}

            {showPrivateContribution && (
              editing ? (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('socialSecurity.privateContribution')}</p>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.privateHealthInsuranceContribution}
                    onChange={(e) => setForm({ ...form, privateHealthInsuranceContribution: e.target.value })}
                  />
                </div>
              ) : (
                <Field
                  label={t('socialSecurity.privateContribution')}
                  value={
                    employee?.privateHealthInsuranceContribution != null
                      ? `${Number(employee.privateHealthInsuranceContribution).toFixed(2)} EUR`
                      : null
                  }
                />
              )
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('socialSecurity.personnelGroupCode')}</p>
                <Input
                  value={form.personnelGroupCode}
                  onChange={(e) => setForm({ ...form, personnelGroupCode: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('socialSecurity.personnelGroupCode')}
                value={employee?.personnelGroupCode}
              />
            )}

            {editing ? (
              <div className="sm:col-span-2 lg:col-span-3 space-y-1">
                <p className="text-sm text-muted-foreground">{t('socialSecurity.contributionGroupCode')}</p>
                <Input
                  value={form.contributionGroupCode}
                  onChange={(e) => setForm({ ...form, contributionGroupCode: e.target.value })}
                  placeholder="z.B. 1111"
                />
              </div>
            ) : (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-sm text-muted-foreground mb-2">
                  {t('socialSecurity.contributionGroupCode')}
                </p>
                <div className="flex gap-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t('socialSecurity.contributionKV')}</p>
                    <p className="text-sm font-medium">
                      {employee?.contributionGroupKV ?? '---'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t('socialSecurity.contributionRV')}</p>
                    <p className="text-sm font-medium">
                      {employee?.contributionGroupRV ?? '---'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t('socialSecurity.contributionAV')}</p>
                    <p className="text-sm font-medium">
                      {employee?.contributionGroupAV ?? '---'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t('socialSecurity.contributionPV')}</p>
                    <p className="text-sm font-medium">
                      {employee?.contributionGroupPV ?? '---'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('socialSecurity.activityCode')}</p>
                <Input
                  value={form.activityCode}
                  onChange={(e) => setForm({ ...form, activityCode: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('socialSecurity.activityCode')}
                value={employee?.activityCode}
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('socialSecurity.midijobFlag')}</p>
                <Select value={form.midijobFlag} onValueChange={(val) => setForm({ ...form, midijobFlag: val === '__empty__' ? '' : val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="---" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">---</SelectItem>
                    <SelectItem value="0">{midijobLabels['0']}</SelectItem>
                    <SelectItem value="1">{midijobLabels['1']}</SelectItem>
                    <SelectItem value="2">{midijobLabels['2']}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Field
                label={t('socialSecurity.midijobFlag')}
                value={
                  employee?.midijobFlag != null
                    ? midijobLabels[String(employee.midijobFlag)] ?? String(employee.midijobFlag)
                    : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('socialSecurity.umlageU1')}</p>
                <div className="flex items-center h-9">
                  <Checkbox
                    checked={form.umlageU1}
                    onCheckedChange={(v) => setForm({ ...form, umlageU1: !!v })}
                  />
                  <span className="ml-2 text-sm">{form.umlageU1 ? 'Ja' : 'Nein'}</span>
                </div>
              </div>
            ) : (
              <Field
                label={t('socialSecurity.umlageU1')}
                value={
                  employee?.umlageU1 != null ? (
                    <Badge variant={employee.umlageU1 ? 'default' : 'secondary'}>
                      {employee.umlageU1 ? 'Ja' : 'Nein'}
                    </Badge>
                  ) : null
                }
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('socialSecurity.umlageU2')}</p>
                <div className="flex items-center h-9">
                  <Checkbox
                    checked={form.umlageU2}
                    onCheckedChange={(v) => setForm({ ...form, umlageU2: !!v })}
                  />
                  <span className="ml-2 text-sm">{form.umlageU2 ? 'Ja' : 'Nein'}</span>
                </div>
              </div>
            ) : (
              <Field
                label={t('socialSecurity.umlageU2')}
                value={
                  employee?.umlageU2 != null ? (
                    <Badge variant={employee.umlageU2 ? 'default' : 'secondary'}>
                      {employee.umlageU2 ? 'Ja' : 'Nein'}
                    </Badge>
                  ) : null
                }
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

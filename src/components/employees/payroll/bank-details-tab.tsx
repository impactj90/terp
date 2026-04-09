'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff } from 'lucide-react'
import { useUpdateEmployee, useHasPermission } from '@/hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Employee = any

interface BankDetailsTabProps {
  employeeId: string
  employee: Employee
}

function maskIban(iban: string | null | undefined): string {
  if (!iban) return '---'
  const clean = iban.replace(/\s/g, '')
  if (clean.length <= 6) return clean
  return clean.slice(0, 2) + '*'.repeat(clean.length - 6) + clean.slice(-4)
}

function formatIban(iban: string | null | undefined): string {
  if (!iban) return '---'
  const clean = iban.replace(/\s/g, '')
  return clean.replace(/(.{4})/g, '$1 ').trim()
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '---'}</p>
    </div>
  )
}

export function BankDetailsTab({ employeeId, employee }: BankDetailsTabProps) {
  const t = useTranslations('employeePayroll')
  const updateEmployee = useUpdateEmployee()
  const { allowed: canEdit } = useHasPermission(['personnel.payroll_data.edit'])

  const [showIban, setShowIban] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [form, setForm] = React.useState({
    iban: '',
    bic: '',
    accountHolder: '',
  })

  function enterEditMode() {
    setForm({
      iban: employee?.iban ?? '',
      bic: employee?.bic ?? '',
      accountHolder: employee?.accountHolder ?? '',
    })
    setEditing(true)
  }

  async function handleSave() {
    await updateEmployee.mutateAsync({
      id: employeeId,
      iban: form.iban || null,
      bic: form.bic || null,
      accountHolder: form.accountHolder || null,
    })
    setEditing(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">{t('bank.title')}</h3>
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
                <p className="text-sm text-muted-foreground">{t('bank.iban')}</p>
                <Input
                  value={form.iban}
                  onChange={(e) => setForm({ ...form, iban: e.target.value })}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('bank.iban')}</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium font-mono">
                    {showIban
                      ? formatIban(employee?.iban)
                      : maskIban(employee?.iban)}
                  </p>
                  {employee?.iban && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowIban(!showIban)}
                    >
                      {showIban ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">
                        {showIban ? t('bank.hideIban') : t('bank.showIban')}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('bank.bic')}</p>
                <Input
                  value={form.bic}
                  onChange={(e) => setForm({ ...form, bic: e.target.value })}
                />
              </div>
            ) : (
              <Field label={t('bank.bic')} value={employee?.bic} />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('bank.accountHolder')}</p>
                <Input
                  value={form.accountHolder}
                  onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
                />
              </div>
            ) : (
              <Field label={t('bank.accountHolder')} value={employee?.accountHolder} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useUpdateEmployee, useHasPermission } from '@/hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Employee = any

interface DisabilityTabProps {
  employeeId: string
  employee: Employee
}

const MARKER_KEYS = ['G', 'aG', 'H', 'Bl', 'TBl', 'RF', '1Kl', 'B', 'GL'] as const

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '---'}</p>
    </div>
  )
}

export function DisabilityTab({ employeeId, employee }: DisabilityTabProps) {
  const t = useTranslations('employeePayroll')
  const updateEmployee = useUpdateEmployee()
  const { allowed: canEdit } = useHasPermission(['personnel.payroll_data.edit'])

  const [editing, setEditing] = React.useState(false)
  const [form, setForm] = React.useState({
    disabilityDegree: '',
    disabilityEqualStatus: false,
    disabilityMarkers: '',
    disabilityIdValidUntil: '',
  })

  function enterEditMode() {
    const markers = employee?.disabilityMarkers
      ? typeof employee.disabilityMarkers === 'string'
        ? employee.disabilityMarkers
        : Array.isArray(employee.disabilityMarkers)
          ? employee.disabilityMarkers.join(', ')
          : ''
      : ''

    setForm({
      disabilityDegree: employee?.disabilityDegree != null ? String(employee.disabilityDegree) : '',
      disabilityEqualStatus: employee?.disabilityEqualStatus ?? false,
      disabilityMarkers: markers,
      disabilityIdValidUntil: employee?.disabilityIdValidUntil
        ? new Date(employee.disabilityIdValidUntil).toISOString().split('T')[0] ?? ''
        : '',
    })
    setEditing(true)
  }

  async function handleSave() {
    await updateEmployee.mutateAsync({
      id: employeeId,
      disabilityDegree: form.disabilityDegree ? parseInt(form.disabilityDegree) : null,
      disabilityEqualStatus: form.disabilityEqualStatus,
      disabilityMarkers: form.disabilityMarkers || null,
      disabilityIdValidUntil: form.disabilityIdValidUntil || null,
    })
    setEditing(false)
  }

  const activeMarkers = React.useMemo(() => {
    if (!employee?.disabilityMarkers) return []
    const raw = typeof employee.disabilityMarkers === 'string'
      ? employee.disabilityMarkers.split(',').map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(employee.disabilityMarkers) ? employee.disabilityMarkers : []
    return raw as string[]
  }, [employee?.disabilityMarkers])

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">{t('disability.title')}</h3>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('disability.disabilityDegree')}</p>
                <Input
                  type="number"
                  min="20"
                  max="100"
                  value={form.disabilityDegree}
                  onChange={(e) => setForm({ ...form, disabilityDegree: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('disability.disabilityDegree')}
                value={employee?.disabilityDegree != null ? `${employee.disabilityDegree}%` : null}
              />
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('disability.disabilityEqualStatus')}</p>
                <div className="flex items-center h-9">
                  <Checkbox
                    checked={form.disabilityEqualStatus}
                    onCheckedChange={(v) => setForm({ ...form, disabilityEqualStatus: !!v })}
                  />
                  <span className="ml-2 text-sm">{form.disabilityEqualStatus ? 'Ja' : 'Nein'}</span>
                </div>
              </div>
            ) : (
              <Field
                label={t('disability.disabilityEqualStatus')}
                value={
                  employee?.disabilityEqualStatus != null ? (
                    <Badge variant={employee.disabilityEqualStatus ? 'default' : 'secondary'}>
                      {employee.disabilityEqualStatus ? 'Ja' : 'Nein'}
                    </Badge>
                  ) : null
                }
              />
            )}

            {editing ? (
              <div className="sm:col-span-2 space-y-1">
                <p className="text-sm text-muted-foreground">{t('disability.disabilityMarkers')}</p>
                <Input
                  value={form.disabilityMarkers}
                  onChange={(e) => setForm({ ...form, disabilityMarkers: e.target.value })}
                  placeholder="G, aG, H, Bl, TBl, RF, 1Kl, B, GL"
                />
              </div>
            ) : (
              <div className="sm:col-span-2 space-y-1">
                <p className="text-sm text-muted-foreground">{t('disability.disabilityMarkers')}</p>
                {activeMarkers.length === 0 ? (
                  <p className="text-sm font-medium">---</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {MARKER_KEYS.filter((mk) => activeMarkers.includes(mk)).map((mk) => (
                      <Badge key={mk} variant="outline" className="text-xs">
                        {mk} - {t(`disability.markers.${mk}`)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {editing ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('disability.disabilityIdValidUntil')}</p>
                <Input
                  type="date"
                  value={form.disabilityIdValidUntil}
                  onChange={(e) => setForm({ ...form, disabilityIdValidUntil: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label={t('disability.disabilityIdValidUntil')}
                value={
                  employee?.disabilityIdValidUntil
                    ? format(new Date(employee.disabilityIdValidUntil), 'dd.MM.yyyy')
                    : null
                }
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

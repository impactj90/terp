'use client'

import * as React from 'react'
import { Plus, Trash2, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useHasPermission } from '@/hooks'
import {
  useEmployeeSalaryHistory,
  useCreateSalaryHistoryEntry,
  useDeleteSalaryHistoryEntry,
} from '@/hooks/use-employee-salary-history'

interface Props {
  employeeId: string
}

type ChangeReason =
  | 'initial'
  | 'raise'
  | 'tariff_change'
  | 'promotion'
  | 'other'

const CHANGE_REASON_LABELS: Record<ChangeReason, string> = {
  initial: 'Initial',
  raise: 'Gehaltserhöhung',
  tariff_change: 'Tarifänderung',
  promotion: 'Beförderung',
  other: 'Sonstige',
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  monthly: 'Monatsgehalt',
  hourly: 'Stundenlohn',
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value == null) return '–'
  const n = typeof value === 'number' ? value : Number(value)
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n)
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '–'
  return format(new Date(value), 'dd.MM.yyyy')
}

export function SalaryHistorySection({ employeeId }: Props) {
  const { allowed: canEdit } = useHasPermission(['personnel.payroll_data.edit'])
  const listQuery = useEmployeeSalaryHistory(employeeId)
  const createMutation = useCreateSalaryHistoryEntry(employeeId)
  const deleteMutation = useDeleteSalaryHistoryEntry(employeeId)

  const [creating, setCreating] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<{
    id: string
    label: string
  } | null>(null)

  const [form, setForm] = React.useState({
    validFrom: '',
    paymentType: 'monthly' as 'monthly' | 'hourly',
    grossSalary: '',
    hourlyRate: '',
    changeReason: 'raise' as ChangeReason,
    notes: '',
  })

  const entries = listQuery.data ?? []

  function resetForm() {
    setForm({
      validFrom: '',
      paymentType: 'monthly',
      grossSalary: '',
      hourlyRate: '',
      changeReason: 'raise',
      notes: '',
    })
  }

  async function handleCreate() {
    if (!form.validFrom) {
      toast.error('Bitte "Gültig ab" setzen.')
      return
    }
    if (form.paymentType === 'monthly' && !form.grossSalary) {
      toast.error('Bitte Bruttogehalt angeben.')
      return
    }
    if (form.paymentType === 'hourly' && !form.hourlyRate) {
      toast.error('Bitte Stundenlohn angeben.')
      return
    }
    try {
      await createMutation.mutateAsync({
        employeeId,
        validFrom: new Date(form.validFrom),
        paymentType: form.paymentType,
        grossSalary: form.grossSalary ? Number(form.grossSalary) : null,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        changeReason: form.changeReason,
        notes: form.notes || null,
      })
      toast.success('Gehaltshistorie-Eintrag angelegt.')
      setCreating(false)
      resetForm()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Anlegen fehlgeschlagen: ${msg}`)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id })
      toast.success('Eintrag gelöscht.')
      setDeleteTarget(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Löschen fehlgeschlagen: ${msg}`)
    }
  }

  return (
    <Card data-testid="salary-history-section">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Gehaltshistorie</h3>
          </div>
          {canEdit && !creating && (
            <Button
              size="sm"
              onClick={() => setCreating(true)}
              data-testid="salary-history-add"
            >
              <Plus className="mr-1 h-4 w-4" /> Neuer Eintrag
            </Button>
          )}
        </div>

        {creating && (
          <div className="grid grid-cols-1 gap-3 rounded border p-4 md:grid-cols-2">
            <div>
              <Label>Gültig ab</Label>
              <Input
                type="date"
                value={form.validFrom}
                onChange={(e) =>
                  setForm((f) => ({ ...f, validFrom: e.target.value }))
                }
                data-testid="salary-history-valid-from"
              />
            </div>
            <div>
              <Label>Zahlungstyp</Label>
              <Select
                value={form.paymentType}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    paymentType: v as 'monthly' | 'hourly',
                  }))
                }
              >
                <SelectTrigger data-testid="salary-history-payment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monatsgehalt</SelectItem>
                  <SelectItem value="hourly">Stundenlohn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.paymentType === 'monthly' ? (
              <div>
                <Label>Bruttogehalt (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.grossSalary}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, grossSalary: e.target.value }))
                  }
                  data-testid="salary-history-gross"
                />
              </div>
            ) : (
              <div>
                <Label>Stundenlohn (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.hourlyRate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hourlyRate: e.target.value }))
                  }
                  data-testid="salary-history-hourly"
                />
              </div>
            )}
            <div>
              <Label>Änderungsgrund</Label>
              <Select
                value={form.changeReason}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    changeReason: v as ChangeReason,
                  }))
                }
              >
                <SelectTrigger data-testid="salary-history-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANGE_REASON_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Notiz (optional)</Label>
              <Input
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                data-testid="salary-history-notes"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(false)
                  resetForm()
                }}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                data-testid="salary-history-save"
              >
                Speichern
              </Button>
            </div>
          </div>
        )}

        {listQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Lade...</p>
        ) : entries.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="salary-history-empty"
          >
            Noch keine Einträge. Der erste Eintrag gilt als "initial".
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Gültig ab</th>
                  <th className="p-2">Gültig bis</th>
                  <th className="p-2">Typ</th>
                  <th className="p-2 text-right">Wert</th>
                  <th className="p-2">Grund</th>
                  <th className="p-2">Notiz</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody data-testid="salary-history-rows">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`border-b ${
                      entry.validTo === null ? 'bg-green-50' : ''
                    }`}
                    data-testid={`salary-history-row-${entry.id}`}
                  >
                    <td className="p-2">{formatDate(entry.validFrom)}</td>
                    <td className="p-2">
                      {entry.validTo
                        ? formatDate(entry.validTo)
                        : <span className="font-medium text-green-700">aktuell</span>}
                    </td>
                    <td className="p-2">
                      {PAYMENT_TYPE_LABELS[entry.paymentType] ?? entry.paymentType}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {entry.paymentType === 'monthly'
                        ? formatCurrency(entry.grossSalary)
                        : formatCurrency(entry.hourlyRate) + ' / h'}
                    </td>
                    <td className="p-2">
                      {CHANGE_REASON_LABELS[
                        entry.changeReason as ChangeReason
                      ] ?? entry.changeReason}
                    </td>
                    <td className="p-2">{entry.notes || '–'}</td>
                    <td className="p-2 text-right">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeleteTarget({
                              id: entry.id,
                              label: formatDate(entry.validFrom),
                            })
                          }
                          data-testid={`salary-history-delete-${entry.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Eintrag löschen"
        description={
          deleteTarget
            ? `Der Gehaltshistorie-Eintrag vom ${deleteTarget.label} wird gelöscht. Das Löschen schliesst den Vorgänger-Eintrag NICHT automatisch wieder — bitte manuell prüfen.`
            : ''
        }
        confirmLabel="Löschen"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </Card>
  )
}

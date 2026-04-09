'use client'

import * as React from 'react'
import { Plus, Trash2, Play, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useExportTemplates } from '@/hooks/use-export-templates'
import {
  useExportTemplateSchedules,
  useCreateExportTemplateSchedule,
  useUpdateExportTemplateSchedule,
  useDeleteExportTemplateSchedule,
} from '@/hooks/use-export-template-schedules'

const FREQUENCIES = [
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
] as const

const DAY_PERIODS = [
  { value: 'previous_month', label: 'Vormonat' },
  { value: 'current_month', label: 'Aktueller Monat' },
] as const

const WEEKDAYS = [
  { value: '0', label: 'Sonntag' },
  { value: '1', label: 'Montag' },
  { value: '2', label: 'Dienstag' },
  { value: '3', label: 'Mittwoch' },
  { value: '4', label: 'Donnerstag' },
  { value: '5', label: 'Freitag' },
  { value: '6', label: 'Samstag' },
]

export default function ExportTemplateSchedulesPage() {
  const templatesQuery = useExportTemplates(true)
  const schedulesQuery = useExportTemplateSchedules(true)
  const createMutation = useCreateExportTemplateSchedule()
  const updateMutation = useUpdateExportTemplateSchedule()
  const deleteMutation = useDeleteExportTemplateSchedule()

  const [showForm, setShowForm] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Form state
  const [name, setName] = React.useState('')
  const [templateId, setTemplateId] = React.useState('')
  const [frequency, setFrequency] = React.useState<'daily' | 'weekly' | 'monthly'>('monthly')
  const [dayOfWeek, setDayOfWeek] = React.useState('1')
  const [dayOfMonth, setDayOfMonth] = React.useState(5)
  const [hourOfDay, setHourOfDay] = React.useState(6)
  const [dayPeriod, setDayPeriod] = React.useState<'previous_month' | 'current_month'>('previous_month')
  const [recipientEmails, setRecipientEmails] = React.useState('')

  const resetForm = () => {
    setName('')
    setTemplateId('')
    setFrequency('monthly')
    setDayOfWeek('1')
    setDayOfMonth(5)
    setHourOfDay(6)
    setDayPeriod('previous_month')
    setRecipientEmails('')
    setError(null)
  }

  const handleCreate = async () => {
    setError(null)
    try {
      await createMutation.mutateAsync({
        templateId,
        name,
        frequency,
        dayOfWeek: frequency === 'weekly' ? Number(dayOfWeek) : null,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : null,
        hourOfDay,
        dayPeriod,
        recipientEmails,
      })
      resetForm()
      setShowForm(false)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleToggleActive = async (id: string, current: boolean) => {
    await updateMutation.mutateAsync({ id, isActive: !current })
  }

  const handleConfirmDelete = async () => {
    if (!deleteId) return
    await deleteMutation.mutateAsync({ id: deleteId })
    setDeleteId(null)
  }

  const schedules = schedulesQuery.data ?? []
  const templates = templatesQuery.data ?? []

  return (
    <div className="space-y-6" data-testid="export-template-schedules-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Export-Zeitpläne</h1>
          <p className="text-muted-foreground">
            Automatische Ausführung von Export-Templates per Cron. Neue
            Zeitpläne sind standardmäßig deaktiviert.
          </p>
        </div>
        {!showForm && (
          <Button
            onClick={() => setShowForm(true)}
            data-testid="schedule-new"
          >
            <Plus className="mr-2 h-4 w-4" /> Neuer Zeitplan
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">Neuer Zeitplan</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="sched-name">Name</Label>
                <Input
                  id="sched-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="schedule-name"
                />
              </div>
              <div>
                <Label htmlFor="sched-tpl">Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger id="sched-tpl" data-testid="schedule-template">
                    <SelectValue placeholder="Template wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sched-freq">Häufigkeit</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
                  <SelectTrigger id="sched-freq" data-testid="schedule-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {frequency === 'weekly' && (
                <div>
                  <Label htmlFor="sched-dow">Wochentag</Label>
                  <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                    <SelectTrigger id="sched-dow">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {frequency === 'monthly' && (
                <div>
                  <Label htmlFor="sched-dom">Tag im Monat (1–28)</Label>
                  <Input
                    id="sched-dom"
                    type="number"
                    min={1}
                    max={28}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    data-testid="schedule-day-of-month"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="sched-hod">Stunde (UTC, 0–23)</Label>
                <Input
                  id="sched-hod"
                  type="number"
                  min={0}
                  max={23}
                  value={hourOfDay}
                  onChange={(e) => setHourOfDay(Number(e.target.value))}
                  data-testid="schedule-hour"
                />
              </div>
              <div>
                <Label htmlFor="sched-period">Welcher Zeitraum</Label>
                <Select value={dayPeriod} onValueChange={(v) => setDayPeriod(v as typeof dayPeriod)}>
                  <SelectTrigger id="sched-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_PERIODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="sched-recipients">
                  Empfänger (mit Komma oder Semikolon trennen)
                </Label>
                <Input
                  id="sched-recipients"
                  value={recipientEmails}
                  onChange={(e) => setRecipientEmails(e.target.value)}
                  placeholder="steuer@example.com; lohn@example.com"
                  data-testid="schedule-recipients"
                />
              </div>
            </div>
            {error && (
              <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  resetForm()
                  setShowForm(false)
                }}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  createMutation.isPending ||
                  !name.trim() ||
                  !templateId ||
                  !recipientEmails.trim()
                }
                data-testid="schedule-save"
              >
                Anlegen (deaktiviert)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          {schedulesQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Lade Zeitpläne...
            </div>
          ) : schedules.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Keine Zeitpläne konfiguriert.
            </div>
          ) : (
            <div className="space-y-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border p-3"
                  data-testid={`schedule-row-${s.name}`}
                >
                  <div className="space-y-1">
                    <div className="font-medium">
                      {s.name}
                      <span
                        className={`ml-2 rounded px-2 py-0.5 text-xs ${
                          s.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {s.isActive ? 'Aktiv' : 'Deaktiviert'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.frequency} · {s.hourOfDay}:00 UTC ·{' '}
                      {s.dayPeriod === 'previous_month' ? 'Vormonat' : 'Aktueller Monat'} ·{' '}
                      {s.recipientEmails}
                    </div>
                    {s.lastRunStatus && (
                      <div className="text-xs">
                        Letzter Lauf:{' '}
                        <span
                          className={
                            s.lastRunStatus === 'success'
                              ? 'text-green-700'
                              : 'text-red-700'
                          }
                        >
                          {s.lastRunStatus}
                        </span>{' '}
                        {s.lastRunMessage}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleActive(s.id, s.isActive)}
                      data-testid={`schedule-toggle-${s.name}`}
                    >
                      {s.isActive ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteId(s.id)}
                      data-testid={`schedule-delete-${s.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title="Zeitplan löschen"
        description="Soll dieser Zeitplan wirklich gelöscht werden?"
        confirmLabel="Löschen"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

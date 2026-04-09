'use client'

import * as React from 'react'
import { Loader2, Play, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useCreateExportTemplate,
  useUpdateExportTemplate,
  usePreviewExportTemplate,
} from '@/hooks/use-export-templates'

export interface ExportTemplateInitial {
  id?: string
  name?: string
  description?: string | null
  targetSystem?: string
  templateBody?: string
  outputFilename?: string
  encoding?: string
  lineEnding?: string
  fieldSeparator?: string
  decimalSeparator?: string
  dateFormat?: string
  isActive?: boolean
}

interface Props {
  initial?: ExportTemplateInitial
  onClose: () => void
  onSaved: () => void
}

const TARGETS = [
  { value: 'datev_lodas', label: 'DATEV LODAS' },
  { value: 'datev_lug', label: 'DATEV Lohn und Gehalt' },
  { value: 'lexware', label: 'Lexware Lohn+Gehalt' },
  { value: 'sage', label: 'SAGE HR' },
  { value: 'custom', label: 'Generisch / Eigenes Format' },
]
const ENCODINGS = [
  { value: 'windows-1252', label: 'Windows-1252 (DATEV)' },
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'utf-8-bom', label: 'UTF-8 mit BOM' },
]
const LINE_ENDINGS = [
  { value: 'crlf', label: 'CRLF (Windows)' },
  { value: 'lf', label: 'LF (Unix)' },
]

const DEFAULT_BODY = `{% comment %}
  Standard-Template — passen Sie es an Ihr Zielformat an.
  Verfügbare Filter: datev_date, datev_decimal, datev_string,
  pad_left, pad_right, mask_iban
{% endcomment %}
Personalnummer;Name;Vorname;Sollstunden;Iststunden
{% for emp in employees -%}
{{ emp.personnelNumber }};{{ emp.lastName | datev_string }};{{ emp.firstName | datev_string }};{{ emp.monthlyValues.targetHours | datev_decimal: 2 }};{{ emp.monthlyValues.workedHours | datev_decimal: 2 }}
{% endfor %}`

export function ExportTemplateEditor({ initial, onClose, onSaved }: Props) {
  const [name, setName] = React.useState(initial?.name ?? '')
  const [description, setDescription] = React.useState(initial?.description ?? '')
  const [targetSystem, setTargetSystem] = React.useState(
    initial?.targetSystem ?? 'datev_lodas',
  )
  const [templateBody, setTemplateBody] = React.useState(
    initial?.templateBody ?? DEFAULT_BODY,
  )
  const [outputFilename, setOutputFilename] = React.useState(
    initial?.outputFilename ?? 'export_{{period.year}}{{period.monthPadded}}.txt',
  )
  const [encoding, setEncoding] = React.useState(initial?.encoding ?? 'windows-1252')
  const [lineEnding, setLineEnding] = React.useState(initial?.lineEnding ?? 'crlf')
  const [fieldSeparator, setFieldSeparator] = React.useState(initial?.fieldSeparator ?? ';')
  const [decimalSeparator, setDecimalSeparator] = React.useState(initial?.decimalSeparator ?? ',')
  const [dateFormat, setDateFormat] = React.useState(initial?.dateFormat ?? 'TT.MM.JJJJ')
  const [isActive] = React.useState(initial?.isActive ?? true)

  const [error, setError] = React.useState<string | null>(null)
  const [previewText, setPreviewText] = React.useState<string | null>(null)
  const [previewMeta, setPreviewMeta] = React.useState<{
    employeeCount: number
    byteSize: number
    truncated: boolean
  } | null>(null)
  const today = new Date()
  const [previewYear, setPreviewYear] = React.useState(today.getFullYear())
  const [previewMonth, setPreviewMonth] = React.useState(
    Math.max(1, today.getMonth()),
  )

  const createMutation = useCreateExportTemplate()
  const updateMutation = useUpdateExportTemplate()
  const previewMutation = usePreviewExportTemplate()

  const isEditing = Boolean(initial?.id)
  const saving = createMutation.isPending || updateMutation.isPending

  const handleSave = async () => {
    setError(null)
    try {
      if (isEditing && initial?.id) {
        await updateMutation.mutateAsync({
          id: initial.id,
          name,
          description: description || null,
          targetSystem: targetSystem as 'datev_lodas' | 'datev_lug' | 'lexware' | 'sage' | 'custom',
          templateBody,
          outputFilename,
          encoding: encoding as 'windows-1252' | 'utf-8' | 'utf-8-bom',
          lineEnding: lineEnding as 'crlf' | 'lf',
          fieldSeparator,
          decimalSeparator,
          dateFormat,
          isActive,
        })
      } else {
        await createMutation.mutateAsync({
          name,
          description: description || null,
          targetSystem: targetSystem as 'datev_lodas' | 'datev_lug' | 'lexware' | 'sage' | 'custom',
          templateBody,
          outputFilename,
          encoding: encoding as 'windows-1252' | 'utf-8' | 'utf-8-bom',
          lineEnding: lineEnding as 'crlf' | 'lf',
          fieldSeparator,
          decimalSeparator,
          dateFormat,
          isActive,
        })
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handlePreview = async () => {
    if (!initial?.id) {
      setError('Bitte zuerst Template speichern, um eine Vorschau zu erzeugen.')
      return
    }
    setError(null)
    try {
      const result = await previewMutation.mutateAsync({
        id: initial.id,
        year: previewYear,
        month: previewMonth,
      })
      setPreviewText(result.rendered)
      setPreviewMeta({
        employeeCount: result.employeeCount,
        byteSize: result.byteSize,
        truncated: result.truncated,
      })
    } catch (err) {
      setError((err as Error).message)
      setPreviewText(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {isEditing ? 'Template bearbeiten' : 'Neues Template'}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="tpl-name">Name</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="export-template-name"
          />
        </div>
        <div>
          <Label htmlFor="tpl-target">Zielsystem</Label>
          <Select value={targetSystem} onValueChange={setTargetSystem}>
            <SelectTrigger id="tpl-target" data-testid="export-template-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGETS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="tpl-desc">Beschreibung</Label>
          <Input
            id="tpl-desc"
            value={description ?? ''}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="tpl-encoding">Encoding</Label>
          <Select value={encoding} onValueChange={setEncoding}>
            <SelectTrigger id="tpl-encoding">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENCODINGS.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="tpl-lineend">Zeilenende</Label>
          <Select value={lineEnding} onValueChange={setLineEnding}>
            <SelectTrigger id="tpl-lineend">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINE_ENDINGS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="tpl-sep">Feldtrennzeichen</Label>
          <Input
            id="tpl-sep"
            value={fieldSeparator}
            onChange={(e) => setFieldSeparator(e.target.value)}
            maxLength={5}
          />
        </div>
        <div>
          <Label htmlFor="tpl-dec">Dezimaltrenner</Label>
          <Input
            id="tpl-dec"
            value={decimalSeparator}
            onChange={(e) => setDecimalSeparator(e.target.value.slice(0, 1))}
            maxLength={1}
          />
        </div>
        <div>
          <Label htmlFor="tpl-date">Datumsformat</Label>
          <Input
            id="tpl-date"
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="tpl-fname">Dateiname-Muster</Label>
          <Input
            id="tpl-fname"
            value={outputFilename}
            onChange={(e) => setOutputFilename(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="tpl-body">Template-Body (Liquid)</Label>
        <Textarea
          id="tpl-body"
          value={templateBody}
          onChange={(e) => setTemplateBody(e.target.value)}
          rows={18}
          className="font-mono text-xs"
          data-testid="export-template-body"
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="tpl-prev-year">Jahr</Label>
          <Input
            id="tpl-prev-year"
            type="number"
            value={previewYear}
            onChange={(e) => setPreviewYear(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <div>
          <Label htmlFor="tpl-prev-month">Monat</Label>
          <Input
            id="tpl-prev-month"
            type="number"
            min={1}
            max={12}
            value={previewMonth}
            onChange={(e) => setPreviewMonth(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <Button
          variant="outline"
          onClick={handlePreview}
          disabled={previewMutation.isPending || !isEditing}
          data-testid="export-template-preview"
        >
          {previewMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Vorschau erzeugen
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim() || !templateBody.trim()}
          data-testid="export-template-save"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {isEditing ? 'Speichern' : 'Anlegen'}
        </Button>
      </div>

      {previewText !== null && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {previewMeta?.employeeCount} Mitarbeiter · {previewMeta?.byteSize} Bytes
            {previewMeta?.truncated && ' · Vorschau auf 50 KB gekürzt'}
          </div>
          <pre
            className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs"
            data-testid="export-template-preview-output"
          >
            {previewText}
          </pre>
        </div>
      )}
    </div>
  )
}

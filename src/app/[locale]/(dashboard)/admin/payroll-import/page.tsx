'use client'

import * as React from 'react'
import { Upload, Download, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  useParsePayrollBulkFile,
  useConfirmPayrollBulkImport,
} from '@/hooks/use-payroll-bulk-import'
import { useTRPC } from '@/trpc'
import { useQueryClient } from '@tanstack/react-query'

type ParseResult = Awaited<
  ReturnType<ReturnType<typeof useParsePayrollBulkFile>['mutateAsync']>
>

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = reader.result as string
      const base64 = raw.slice(raw.indexOf(',') + 1)
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function PayrollImportPage() {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [fileBase64, setFileBase64] = React.useState<string | null>(null)
  const [parseResult, setParseResult] = React.useState<ParseResult | null>(null)
  const [confirmSummary, setConfirmSummary] = React.useState<{
    updated: number
    skipped: number
  } | null>(null)

  const parseMutation = useParsePayrollBulkFile()
  const confirmMutation = useConfirmPayrollBulkImport()
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setConfirmSummary(null)
    setSelectedFile(file)
    try {
      const base64 = await fileToBase64(file)
      setFileBase64(base64)
      const result = await parseMutation.mutateAsync({
        fileBase64: base64,
        filename: file.name,
      })
      if (result) setParseResult(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Datei konnte nicht geparst werden: ${msg}`)
      setSelectedFile(null)
      setFileBase64(null)
      setParseResult(null)
    }
  }

  const onConfirm = async () => {
    if (!selectedFile || !fileBase64) return
    try {
      const result = await confirmMutation.mutateAsync({
        fileBase64,
        filename: selectedFile.name,
      })
      if (result) {
        setConfirmSummary({
          updated: result.updated,
          skipped: result.skipped,
        })
        toast.success(
          `${result.updated} Mitarbeiter aktualisiert, ${result.skipped} übersprungen.`,
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Import fehlgeschlagen: ${msg}`)
    }
  }

  const onDownloadTemplate = async () => {
    try {
      const res = await queryClient.fetchQuery(
        trpc.payrollBulkImport.downloadTemplate.queryOptions(),
      )
      if (!res) return
      const binary = atob(res.contentBase64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: res.contentType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Vorlage konnte nicht heruntergeladen werden: ${msg}`)
    }
  }

  return (
    <div className="space-y-6" data-testid="payroll-import-page">
      <div>
        <h1 className="text-2xl font-bold">Lohn-Massenimport</h1>
        <p className="text-muted-foreground">
          Aktualisieren Sie Lohnstammdaten für bis zu 500 Mitarbeiter auf
          einmal. Laden Sie eine CSV- oder XLSX-Datei hoch; das System
          validiert jede Zeile vor dem endgültigen Import.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={onDownloadTemplate}
              data-testid="payroll-import-download-template"
            >
              <Download className="mr-2 h-4 w-4" /> CSV-Vorlage herunterladen
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={onFileSelected}
                data-testid="payroll-import-file-input"
              />
              <span>
                <Button
                  asChild
                  disabled={parseMutation.isPending}
                  data-testid="payroll-import-choose-file"
                >
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    {parseMutation.isPending ? 'Parse...' : 'Datei wählen'}
                  </span>
                </Button>
              </span>
            </label>
            {selectedFile && (
              <span className="text-sm text-muted-foreground">
                {selectedFile.name}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {parseResult && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Zeilen: </span>
                <strong data-testid="payroll-import-row-count">
                  {parseResult.rowCount}
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground">Valide: </span>
                <strong
                  className="text-green-600"
                  data-testid="payroll-import-valid-count"
                >
                  {parseResult.validCount}
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground">Ungültig: </span>
                <strong
                  className="text-red-600"
                  data-testid="payroll-import-invalid-count"
                >
                  {parseResult.invalidCount}
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Mitarbeiter gefunden:{' '}
                </span>
                <strong>{parseResult.matchedEmployees}</strong>
              </div>
            </div>

            {parseResult.invalidCount > 0 && (
              <div className="max-h-80 overflow-y-auto rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <div className="mb-2 flex items-center font-semibold">
                  <AlertCircle className="mr-1 h-4 w-4" /> Validierungsfehler
                </div>
                <ul
                  className="space-y-1"
                  data-testid="payroll-import-errors-list"
                >
                  {parseResult.rows
                    .filter((r) => r.errors.length > 0)
                    .slice(0, 100)
                    .map((r, idx) => (
                      <li key={idx}>
                        <strong>Zeile {r.lineNumber}</strong>
                        {r.personnelNumber
                          ? ` (${r.personnelNumber})`
                          : ''}
                        : {r.errors.join('; ')}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {parseResult.invalidCount === 0 && parseResult.rowCount > 0 && (
              <div className="flex items-center rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Alle {parseResult.validCount} Zeilen sind valide und können
                importiert werden.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                onClick={onConfirm}
                disabled={
                  parseResult.hasErrors ||
                  parseResult.rowCount === 0 ||
                  confirmMutation.isPending
                }
                data-testid="payroll-import-confirm"
              >
                {confirmMutation.isPending
                  ? 'Importiere...'
                  : `Import bestätigen (${parseResult.validCount} Zeilen)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {confirmSummary && (
        <Card>
          <CardContent className="p-6">
            <div
              className="flex items-center text-lg text-green-700"
              data-testid="payroll-import-success-summary"
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              Import abgeschlossen: {confirmSummary.updated} Mitarbeiter
              aktualisiert
              {confirmSummary.skipped > 0
                ? `, ${confirmSummary.skipped} übersprungen`
                : ''}
              .
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

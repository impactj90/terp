'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useImportPreview,
  useImportCommit,
} from '@/hooks/use-service-objects'

type PreviewResult = {
  rows: Array<{
    rowIndex: number
    data: Record<string, string | undefined>
    errors: string[]
  }>
  rowCount: number
  validCount: number
  invalidCount: number
  unresolvedCustomerAddresses: string[]
  duplicateNumbers: string[]
  hasErrors: boolean
}

export default function ServiceObjectImportPage() {
  const [file, setFile] = React.useState<File | null>(null)
  const [fileBase64, setFileBase64] = React.useState<string>('')
  const [preview, setPreview] = React.useState<PreviewResult | null>(null)
  const parseMut = useImportPreview()
  const commitMut = useImportCommit()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setPreview(null)
    if (!f) {
      setFileBase64('')
      return
    }
    const buffer = await f.arrayBuffer()
    const b64 = Buffer.from(buffer).toString('base64')
    setFileBase64(b64)
  }

  async function handlePreview() {
    if (!file || !fileBase64) return
    try {
      const res = await parseMut.mutateAsync({
        fileBase64,
        filename: file.name,
      })
      setPreview(res as unknown as PreviewResult)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview fehlgeschlagen')
    }
  }

  async function handleCommit() {
    if (!file || !fileBase64) return
    try {
      const res = await commitMut.mutateAsync({
        fileBase64,
        filename: file.name,
      })
      if (res) {
        toast.success(
          `Import abgeschlossen: ${res.created} angelegt, ${res.failedRows.length} fehlgeschlagen`
        )
      }
      setPreview(null)
      setFile(null)
      setFileBase64('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import fehlgeschlagen')
    }
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">CSV-Import — Serviceobjekte</h1>

      <Card>
        <CardHeader>
          <CardTitle>Datei wählen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pflichtspalten: <code>number</code>, <code>name</code>,{' '}
            <code>customerAddressNumber</code>. Optional: <code>kind</code>,{' '}
            <code>parentNumber</code>, <code>internalNumber</code>,{' '}
            <code>manufacturer</code>, <code>model</code>,{' '}
            <code>serialNumber</code>, <code>yearBuilt</code>,{' '}
            <code>inServiceSince</code> (YYYY-MM-DD), <code>description</code>.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              onClick={handlePreview}
              disabled={!file || parseMut.isPending}
            >
              <Upload className="mr-2 h-4 w-4" />
              Vorschau
            </Button>
            <Button
              variant="default"
              onClick={handleCommit}
              disabled={
                !preview ||
                preview.hasErrors ||
                commitMut.isPending
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Importieren
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>
              Vorschau — {preview.rowCount} Zeilen gesamt,{' '}
              <Badge variant="outline" className="mx-1">
                {preview.validCount} gültig
              </Badge>
              <Badge
                variant={preview.invalidCount > 0 ? 'destructive' : 'outline'}
                className="mx-1"
              >
                {preview.invalidCount} fehlerhaft
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {preview.unresolvedCustomerAddresses.length > 0 && (
              <div className="mb-3 rounded-md border border-destructive/50 p-3 text-sm">
                <AlertCircle className="mr-1 inline h-4 w-4 text-destructive" />
                Unbekannte Kunden-Nummern:{' '}
                {preview.unresolvedCustomerAddresses.join(', ')}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Fehler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((r) => (
                  <TableRow
                    key={r.rowIndex}
                    className={r.errors.length > 0 ? 'bg-destructive/10' : ''}
                  >
                    <TableCell>{r.rowIndex + 1}</TableCell>
                    <TableCell>{r.data.number}</TableCell>
                    <TableCell>{r.data.name}</TableCell>
                    <TableCell>{r.data.customerAddressNumber}</TableCell>
                    <TableCell>{r.data.parentNumber ?? '—'}</TableCell>
                    <TableCell className="text-sm text-destructive">
                      {r.errors.join('; ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

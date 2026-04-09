'use client'

import * as React from 'react'
import { Loader2, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  usePayrollWages,
  useUpdatePayrollWage,
  useResetPayrollWages,
} from '@/hooks/use-payroll-wages'

interface EditableRow {
  id: string
  code: string
  name: string
  terpSource: string
  category: string
  isActive: boolean
}

export default function PayrollWagesPage() {
  const { data, isLoading, refetch } = usePayrollWages(true)
  const updateMutation = useUpdatePayrollWage()
  const resetMutation = useResetPayrollWages()
  const [edits, setEdits] = React.useState<Record<string, Partial<EditableRow>>>({})

  const wages = data ?? []

  const handleField = (id: string, field: keyof EditableRow, value: unknown) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const handleSave = async (id: string) => {
    const patch = edits[id]
    if (!patch) return
    await updateMutation.mutateAsync({ id, ...patch })
    setEdits((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const handleReset = async () => {
    if (!confirm('Alle Lohnarten auf Standardwerte zurücksetzen?')) return
    await resetMutation.mutateAsync()
    setEdits({})
    refetch()
  }

  return (
    <div className="space-y-6" data-testid="payroll-wages-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lohnart-Mapping</h1>
          <p className="text-muted-foreground">
            Mandantenspezifisches Mapping von Terp-Datenquellen auf Lohnart-Codes.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={resetMutation.isPending}
          data-testid="payroll-wages-reset"
        >
          {resetMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" />
          )}
          Auf Defaults zurücksetzen
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Lade Lohnarten...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Terp-Quelle</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>Aktiv</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wages.map((w) => {
                  const draft = edits[w.id] ?? {}
                  const dirty = Object.keys(draft).length > 0
                  return (
                    <TableRow key={w.id} data-testid={`payroll-wage-${w.code}`}>
                      <TableCell>
                        <Input
                          value={(draft.code ?? w.code) as string}
                          onChange={(e) => handleField(w.id, 'code', e.target.value)}
                          className="h-8 w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={(draft.name ?? w.name) as string}
                          onChange={(e) => handleField(w.id, 'name', e.target.value)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {w.terpSource}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {w.category}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={(draft.isActive ?? w.isActive) as boolean}
                          onCheckedChange={(checked) =>
                            handleField(w.id, 'isActive', checked)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {dirty && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleSave(w.id)}
                            disabled={updateMutation.isPending}
                            data-testid={`payroll-wage-save-${w.code}`}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

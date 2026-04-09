'use client'

import * as React from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ExportTemplateRow {
  id: string
  name: string
  description: string | null
  targetSystem: string
  encoding: string
  version: number
  isActive: boolean
  updatedAt: string | Date
}

interface Props {
  templates: ExportTemplateRow[]
  onEdit: (id: string) => void
  onDelete: (row: ExportTemplateRow) => void
}

const TARGET_LABELS: Record<string, string> = {
  datev_lodas: 'DATEV LODAS',
  datev_lug: 'DATEV LuG',
  lexware: 'Lexware',
  sage: 'SAGE',
  custom: 'Generisch',
}

export function ExportTemplateList({ templates, onEdit, onDelete }: Props) {
  if (templates.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Noch keine Export-Templates vorhanden. Klicken Sie auf &quot;Neues Template&quot;
        um zu starten.
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Zielsystem</TableHead>
            <TableHead>Encoding</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24 text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((tpl) => (
            <TableRow key={tpl.id} data-testid={`export-template-row-${tpl.name}`}>
              <TableCell>
                <div className="font-medium">{tpl.name}</div>
                {tpl.description && (
                  <div className="text-xs text-muted-foreground">
                    {tpl.description}
                  </div>
                )}
              </TableCell>
              <TableCell>{TARGET_LABELS[tpl.targetSystem] ?? tpl.targetSystem}</TableCell>
              <TableCell>{tpl.encoding}</TableCell>
              <TableCell>v{tpl.version}</TableCell>
              <TableCell>
                {tpl.isActive ? (
                  <Badge>Aktiv</Badge>
                ) : (
                  <Badge variant="secondary">Inaktiv</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(tpl.id)}
                  data-testid={`export-template-edit-${tpl.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(tpl)}
                  data-testid={`export-template-delete-${tpl.name}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

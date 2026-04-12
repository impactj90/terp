'use client'

import * as React from 'react'
import Link from 'next/link'
import { Plus, Library } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useExportTemplates,
  useExportTemplate,
  useDeleteExportTemplate,
} from '@/hooks/use-export-templates'
import { ExportTemplateList } from '@/components/export-templates/export-template-list'
import {
  ExportTemplateEditor,
  type ExportTemplateInitial,
} from '@/components/export-templates/export-template-editor'

interface DeleteTarget {
  id: string
  name: string
}

export default function ExportTemplatesPage() {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null)

  const listQuery = useExportTemplates(true)
  const editingQuery = useExportTemplate(editingId ?? '', !!editingId)
  const deleteMutation = useDeleteExportTemplate()

  const templates = listQuery.data ?? []

  const showEditor = creating || !!editingId
  const initial: ExportTemplateInitial | undefined = creating
    ? undefined
    : editingQuery.data
      ? {
          id: editingQuery.data.id,
          name: editingQuery.data.name,
          description: editingQuery.data.description,
          targetSystem: editingQuery.data.targetSystem,
          templateBody: editingQuery.data.templateBody,
          outputFilename: editingQuery.data.outputFilename,
          encoding: editingQuery.data.encoding,
          lineEnding: editingQuery.data.lineEnding,
          fieldSeparator: editingQuery.data.fieldSeparator,
          decimalSeparator: editingQuery.data.decimalSeparator,
          dateFormat: editingQuery.data.dateFormat,
          isActive: editingQuery.data.isActive,
        }
      : undefined

  const closeEditor = () => {
    setCreating(false)
    setEditingId(null)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await deleteMutation.mutateAsync({ id: deleteTarget.id })
    setDeleteTarget(null)
    if (editingId === deleteTarget.id) closeEditor()
  }

  return (
    <div className="space-y-6" data-testid="export-templates-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Export-Templates</h1>
          <p className="text-muted-foreground">
            Liquid-Templates für DATEV LODAS, LuG, Lexware, SAGE und eigene
            Exportformate.
          </p>
        </div>
        {!showEditor && (
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild data-testid="export-template-library-link">
              <Link href="/admin/export-templates/library">
                <Library className="mr-2 h-4 w-4" /> Template-Bibliothek
              </Link>
            </Button>
            <Button
              onClick={() => {
                setCreating(true)
                setEditingId(null)
              }}
              data-testid="export-template-new"
            >
              <Plus className="mr-2 h-4 w-4" /> Neues Template
            </Button>
          </div>
        )}
      </div>

      {!showEditor && (
        <Card>
          <CardContent className="p-4">
            {listQuery.isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Lade Templates...
              </div>
            ) : (
              <ExportTemplateList
                templates={templates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  description: t.description,
                  targetSystem: t.targetSystem,
                  encoding: t.encoding,
                  version: t.version,
                  isActive: t.isActive,
                  updatedAt: t.updatedAt,
                }))}
                onEdit={(id) => {
                  setEditingId(id)
                  setCreating(false)
                }}
                onDelete={(row) => setDeleteTarget({ id: row.id, name: row.name })}
              />
            )}
          </CardContent>
        </Card>
      )}

      {showEditor && (creating || (editingId && editingQuery.data)) && (
        <Card>
          <CardContent className="p-6">
            <ExportTemplateEditor
              initial={initial}
              onClose={closeEditor}
              onSaved={() => {
                closeEditor()
                listQuery.refetch()
              }}
            />
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Template löschen"
        description={
          deleteTarget
            ? `Soll das Template "${deleteTarget.name}" wirklich gelöscht werden?`
            : ''
        }
        confirmLabel="Löschen"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

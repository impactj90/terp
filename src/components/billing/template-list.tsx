'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Star } from 'lucide-react'
import {
  useBillingDocumentTemplates,
  useDeleteBillingDocumentTemplate,
  useSetDefaultBillingDocumentTemplate,
} from '@/hooks'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TemplateFormSheet } from './template-form-sheet'
import { toast } from 'sonner'

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  OFFER: 'Angebot',
  ORDER_CONFIRMATION: 'Auftragsbestätigung',
  DELIVERY_NOTE: 'Lieferschein',
  SERVICE_NOTE: 'Leistungsschein',
  RETURN_DELIVERY: 'Rücklieferschein',
  INVOICE: 'Rechnung',
  CREDIT_NOTE: 'Gutschrift',
}

export function BillingTemplateList() {
  const { data: templates = [], isLoading } = useBillingDocumentTemplates()
  const deleteMutation = useDeleteBillingDocumentTemplate()
  const setDefaultMutation = useSetDefaultBillingDocumentTemplate()

  const [showForm, setShowForm] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await deleteMutation.mutateAsync({ id: deletingId })
      toast.success('Vorlage gelöscht')
      setDeletingId(null)
    } catch {
      toast.error('Fehler beim Löschen')
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultMutation.mutateAsync({ id })
      toast.success('Standard-Vorlage gesetzt')
    } catch {
      toast.error('Fehler beim Setzen der Standard-Vorlage')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dokumentvorlagen</h1>
        <Button onClick={() => { setEditingId(null); setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-1" />
          Neue Vorlage
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-center py-8">Laden...</div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Keine Vorlagen vorhanden. Erstellen Sie eine neue Vorlage.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <Card key={tpl.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{tpl.name}</span>
                      {tpl.isDefault && (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                          <Star className="h-3 w-3 mr-0.5" />
                          Standard
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {tpl.documentType ? DOCUMENT_TYPE_LABELS[tpl.documentType] ?? tpl.documentType : 'Alle Typen'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {tpl.documentType && !tpl.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleSetDefault(tpl.id)}
                      title="Als Standard setzen"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { setEditingId(tpl.id); setShowForm(true) }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeletingId(tpl.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateFormSheet
        open={showForm}
        onOpenChange={setShowForm}
        templateId={editingId}
      />

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => { if (!open) setDeletingId(null) }}
        title="Vorlage löschen"
        description="Sind Sie sicher, dass Sie diese Vorlage löschen möchten?"
        onConfirm={handleDelete}
        confirmLabel="Löschen"
        variant="destructive"
      />
    </div>
  )
}

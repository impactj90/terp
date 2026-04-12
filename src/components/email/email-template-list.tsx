'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Plus, Pencil, Trash2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useEmailTemplates, useDeleteEmailTemplate, useSeedEmailTemplateDefaults } from '@/hooks/use-email-templates'
import { EmailTemplateSheet } from './email-template-sheet'
import { getAllDocumentTypes } from '@/lib/email/default-templates'

const DOCUMENT_TYPES = getAllDocumentTypes()

const DOC_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'Rechnung',
  OFFER: 'Angebot',
  ORDER_CONFIRMATION: 'Auftragsbestätigung',
  CREDIT_NOTE: 'Gutschrift',
  DELIVERY_NOTE: 'Lieferschein',
  SERVICE_NOTE: 'Serviceschein',
  RETURN_DELIVERY: 'Rücklieferschein',
  PURCHASE_ORDER: 'Bestellung',
}

export function EmailTemplateList() {
  const t = useTranslations('adminEmailSettings')
  const [filter, setFilter] = React.useState<string | undefined>(undefined)
  const { data: templates, isLoading } = useEmailTemplates(filter)
  const deleteMutation = useDeleteEmailTemplate()
  const seedMutation = useSeedEmailTemplateDefaults()

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)

  async function handleSeedDefaults() {
    try {
      const result = await seedMutation.mutateAsync()
      toast.success(t('templateSeedSuccess', { count: result?.count ?? 0 }))
    } catch {
      toast.error(t('templateSeedFailed'))
    }
  }

  function handleEdit(id: string) {
    setEditId(id)
    setSheetOpen(true)
  }

  function handleCreate() {
    setEditId(null)
    setSheetOpen(true)
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync({ id: deleteId })
      toast.success(t('templateDeleteSuccess'))
    } catch {
      toast.error(t('templateDeleteFailed'))
    }
    setDeleteId(null)
  }

  if (isLoading) {
    return (
      <div className="py-8 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Select
          value={filter ?? 'all'}
          onValueChange={(v) => setFilter(v === 'all' ? undefined : v)}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t('templateFilterAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('templateFilterAll')}</SelectItem>
            {DOCUMENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {DOC_TYPE_LABELS[type] ?? type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {t('templateCreate')}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('templateName')}</TableHead>
            <TableHead>{t('templateDocumentType')}</TableHead>
            <TableHead>{t('templateDefault')}</TableHead>
            <TableHead>{t('templateUpdatedAt')}</TableHead>
            <TableHead className="w-[100px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates && templates.length > 0 ? (
            templates.map((tmpl) => (
              <TableRow key={tmpl.id}>
                <TableCell className="font-medium">{tmpl.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {DOC_TYPE_LABELS[tmpl.documentType] ?? tmpl.documentType}
                  </Badge>
                </TableCell>
                <TableCell>
                  {tmpl.isDefault && (
                    <Check className="h-4 w-4 text-green-600" />
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(tmpl.updatedAt).toLocaleDateString('de-DE')}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(tmpl.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(tmpl.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8">
                <div className="space-y-3">
                  <p className="text-muted-foreground">{t('templateEmpty')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSeedDefaults}
                    disabled={seedMutation.isPending}
                  >
                    {seedMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('templateSeedDefaults')}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <EmailTemplateSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editId={editId}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open: boolean) => !open && setDeleteId(null)}
        title={t('templateDeleteTitle')}
        description={t('templateDeleteDescription')}
        confirmLabel={t('delete')}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}

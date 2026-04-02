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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TemplateFormSheet } from './template-form-sheet'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

const DOC_TYPE_KEYS: Record<string, string> = {
  OFFER: 'typeOffer',
  ORDER_CONFIRMATION: 'typeOrderConfirmation',
  DELIVERY_NOTE: 'typeDeliveryNote',
  SERVICE_NOTE: 'typeServiceNote',
  RETURN_DELIVERY: 'typeReturnDelivery',
  INVOICE: 'typeInvoice',
  CREDIT_NOTE: 'typeCreditNote',
}

export function BillingTemplateList() {
  const t = useTranslations('billingTemplates')
  const tc = useTranslations('common')
  const tDoc = useTranslations('billingDocuments')
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
      toast.success(t('templateDeleted'))
      setDeletingId(null)
    } catch {
      toast.error(t('deleteError'))
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultMutation.mutateAsync({ id })
      toast.success(t('defaultTemplateSet'))
    } catch {
      toast.error(t('setDefaultError'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-2xl font-bold">{t('title')}</h1>
        <Button size="sm" onClick={() => { setEditingId(null); setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-1" />
          {t('newTemplate')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-center py-8">{t('loading')}</div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('noTemplates')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <Card key={tpl.id}>
              <CardContent className="flex items-start justify-between gap-2 py-3 sm:py-4 sm:items-center">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-medium truncate">{tpl.name}</span>
                    {tpl.isDefault && (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-300 shrink-0">
                        <Star className="h-3 w-3 mr-0.5" />
                        {t('default')}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {tpl.documentType ? (DOC_TYPE_KEYS[tpl.documentType] ? tDoc(DOC_TYPE_KEYS[tpl.documentType] as any) : tpl.documentType) : t('allTypes')}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {tpl.documentType && !tpl.isDefault && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleSetDefault(tpl.id)}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('setAsDefault')}</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => { setEditingId(tpl.id); setShowForm(true) }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{tc('edit')}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeletingId(tpl.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{tc('delete')}</TooltipContent>
                  </Tooltip>
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
        title={t('deleteTemplate')}
        description={t('deleteDescription')}
        onConfirm={handleDelete}
        confirmLabel={t('deleteConfirm')}
        variant="destructive"
      />
    </div>
  )
}

'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, Star, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  useDunningTemplates,
  useDeleteDunningTemplate,
  useSeedDefaultDunningTemplates,
} from '@/hooks'
import { DunningTemplateFormSheet } from './dunning-template-form-sheet'
import { toast } from 'sonner'

type Template = {
  id: string
  name: string
  level: number
  isDefault: boolean
}

export function DunningTemplatesTab() {
  const t = useTranslations('billingDunning')
  const { data: templates, isLoading } = useDunningTemplates()
  const deleteMutation = useDeleteDunningTemplate()
  const seedMutation = useSeedDefaultDunningTemplates()

  const [showForm, setShowForm] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const tpls = (templates as Template[] | undefined) ?? []

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await deleteMutation.mutateAsync({ id: deletingId })
      toast.success(t('templates.deleted'))
      setDeletingId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('templates.deleteError'))
    }
  }

  const handleSeedDefaults = async () => {
    try {
      const result = await seedMutation.mutateAsync()
      const seeded = (result as { seeded: number } | null)?.seeded ?? 0
      if (seeded > 0) {
        toast.success(t('templates.seededSuccess', { count: seeded }))
      } else {
        toast.info(t('templates.seededSkipped'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('templates.seedError'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base sm:text-lg font-semibold">
          {t('templates.title')}
        </h2>
        <div className="flex items-center gap-2">
          {tpls.length === 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSeedDefaults}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              {t('templates.seedDefaults')}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null)
              setShowForm(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('templates.newTemplate')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {t('loading')}
        </div>
      ) : tpls.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('templates.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tpls.map((tpl) => (
            <Card key={tpl.id}>
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base font-medium truncate">
                      {tpl.name}
                    </span>
                    <Badge variant="outline">
                      {t('templates.levelBadge', { level: tpl.level })}
                    </Badge>
                    {tpl.isDefault && (
                      <Badge
                        variant="outline"
                        className="text-yellow-600 border-yellow-300"
                      >
                        <Star className="h-3 w-3 mr-0.5" />
                        {t('templates.defaultBadge')}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingId(tpl.id)
                          setShowForm(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('templates.edit')}</TooltipContent>
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
                    <TooltipContent>{t('templates.delete')}</TooltipContent>
                  </Tooltip>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DunningTemplateFormSheet
        open={showForm}
        onOpenChange={setShowForm}
        templateId={editingId}
      />

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null)
        }}
        title={t('templates.deleteTitle')}
        description={t('templates.deleteDescription')}
        confirmLabel={t('templates.delete')}
        cancelLabel={t('detail.cancel')}
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}

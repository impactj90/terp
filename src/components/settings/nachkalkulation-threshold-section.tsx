'use client'

/**
 * NK-1 (Phase 7) — Nachkalkulation Threshold Configuration Section.
 *
 * Renders inside the single-page `/admin/settings` view as a collapsible
 * section. Module-gated via `useModules()` — invisible when the
 * `nachkalkulation` module is not active. Permission-gated via
 * `nachkalkulation.config`.
 */
import * as React from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { useModules } from '@/hooks/use-modules'
import {
  useNkThresholds,
  useUpsertNkDefaultThresholds,
  useRemoveNkThresholdOverride,
} from '@/hooks/use-nk-thresholds'
import { useOrderTypes } from '@/hooks/use-order-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { NkThresholdOverrideFormSheet } from '@/components/nachkalkulation/nk-threshold-override-form-sheet'

interface ThresholdConfig {
  id: string
  orderTypeId: string | null
  marginAmberFromPercent: number
  marginRedFromPercent: number
  productivityAmberFromPercent: number
  productivityRedFromPercent: number
}

const DEFAULT_DEFAULTS: ThresholdConfig = {
  id: '',
  orderTypeId: null,
  marginAmberFromPercent: 5,
  marginRedFromPercent: 0,
  productivityAmberFromPercent: 70,
  productivityRedFromPercent: 50,
}

export function NachkalkulationThresholdSection() {
  const t = useTranslations('adminSettingsNachkalkulation')
  const { allowed: canConfig } = useHasPermission(['nachkalkulation.config'])

  const { data: modules } = useModules()
  const enabledModules = (modules && 'modules' in modules
    ? modules.modules
    : []) as Array<{ module: string }>
  const isModuleEnabled = enabledModules.some((m) => m.module === 'nachkalkulation')

  const { data: thresholdsData, isLoading: loadingThresholds } = useNkThresholds({
    enabled: canConfig && isModuleEnabled,
  })
  const { data: orderTypesData } = useOrderTypes({
    enabled: canConfig && isModuleEnabled,
    isActive: true,
  })

  const allThresholds = (thresholdsData?.data ?? []) as ThresholdConfig[]
  const defaults =
    allThresholds.find((c) => c.orderTypeId === null) ?? DEFAULT_DEFAULTS
  const overrides = allThresholds.filter((c) => c.orderTypeId !== null)
  const orderTypes = orderTypesData?.data ?? []

  const orderTypeMap = React.useMemo(() => {
    const map = new Map<string, { code: string; name: string }>()
    for (const ot of orderTypes) map.set(ot.id, { code: ot.code, name: ot.name })
    return map
  }, [orderTypes])

  // Default form
  const [marginAmber, setMarginAmber] = React.useState('')
  const [marginRed, setMarginRed] = React.useState('')
  const [productivityAmber, setProductivityAmber] = React.useState('')
  const [productivityRed, setProductivityRed] = React.useState('')
  const [defaultError, setDefaultError] = React.useState<string | null>(null)
  const [defaultSuccess, setDefaultSuccess] = React.useState<string | null>(null)

  React.useEffect(() => {
    setMarginAmber(String(defaults.marginAmberFromPercent))
    setMarginRed(String(defaults.marginRedFromPercent))
    setProductivityAmber(String(defaults.productivityAmberFromPercent))
    setProductivityRed(String(defaults.productivityRedFromPercent))
  }, [
    defaults.marginAmberFromPercent,
    defaults.marginRedFromPercent,
    defaults.productivityAmberFromPercent,
    defaults.productivityRedFromPercent,
  ])

  const upsertDefaultMutation = useUpsertNkDefaultThresholds()
  const removeOverrideMutation = useRemoveNkThresholdOverride()

  // Override form / delete state
  const [overrideFormOpen, setOverrideFormOpen] = React.useState(false)
  const [editOverride, setEditOverride] = React.useState<ThresholdConfig | null>(null)
  const [deleteOverride, setDeleteOverride] = React.useState<ThresholdConfig | null>(null)

  // Don't render the section at all if the module is disabled or the user
  // has no config permission.
  if (!isModuleEnabled || !canConfig) {
    return null
  }

  const handleSaveDefaults = async () => {
    setDefaultError(null)
    setDefaultSuccess(null)

    const ma = Number(marginAmber)
    const mr = Number(marginRed)
    const pa = Number(productivityAmber)
    const pr = Number(productivityRed)

    if (Number.isNaN(ma) || Number.isNaN(mr) || Number.isNaN(pa) || Number.isNaN(pr)) {
      setDefaultError(t('validationNumberRequired'))
      return
    }
    if (ma <= mr) {
      setDefaultError(t('validationMarginAmberGreaterRed'))
      return
    }
    if (pa <= pr) {
      setDefaultError(t('validationProductivityAmberGreaterRed'))
      return
    }

    try {
      await upsertDefaultMutation.mutateAsync({
        marginAmberFromPercent: ma,
        marginRedFromPercent: mr,
        productivityAmberFromPercent: pa,
        productivityRedFromPercent: pr,
      })
      setDefaultSuccess(t('successDefaultSaved'))
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setDefaultError(apiError.detail ?? apiError.message ?? t('failedDefault'))
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteOverride || deleteOverride.orderTypeId == null) return
    try {
      await removeOverrideMutation.mutateAsync({
        orderTypeId: deleteOverride.orderTypeId,
      })
      setDeleteOverride(null)
    } catch {
      // surfaced via mutation state
    }
  }

  return (
    <section id="nachkalkulation" className="space-y-6 scroll-mt-24">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Defaults */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            {t('sectionDefaults')}
          </h3>

          {loadingThresholds ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="nk-marginAmber">{t('fieldMarginAmber')}</Label>
                  <Input
                    id="nk-marginAmber"
                    type="number"
                    step="0.1"
                    value={marginAmber}
                    onChange={(e) => setMarginAmber(e.target.value)}
                    disabled={upsertDefaultMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nk-marginRed">{t('fieldMarginRed')}</Label>
                  <Input
                    id="nk-marginRed"
                    type="number"
                    step="0.1"
                    value={marginRed}
                    onChange={(e) => setMarginRed(e.target.value)}
                    disabled={upsertDefaultMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nk-productivityAmber">{t('fieldProductivityAmber')}</Label>
                  <Input
                    id="nk-productivityAmber"
                    type="number"
                    step="0.1"
                    value={productivityAmber}
                    onChange={(e) => setProductivityAmber(e.target.value)}
                    disabled={upsertDefaultMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nk-productivityRed">{t('fieldProductivityRed')}</Label>
                  <Input
                    id="nk-productivityRed"
                    type="number"
                    step="0.1"
                    value={productivityRed}
                    onChange={(e) => setProductivityRed(e.target.value)}
                    disabled={upsertDefaultMutation.isPending}
                  />
                </div>
              </div>

              {defaultError && (
                <Alert variant="destructive">
                  <AlertDescription>{defaultError}</AlertDescription>
                </Alert>
              )}
              {defaultSuccess && (
                <Alert>
                  <AlertDescription>{defaultSuccess}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleSaveDefaults}
                disabled={upsertDefaultMutation.isPending}
              >
                {upsertDefaultMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {upsertDefaultMutation.isPending ? t('saving') : t('saveDefaults')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Overrides */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t('sectionOverrides')}
            </h3>
            <Button
              size="sm"
              onClick={() => {
                setEditOverride(null)
                setOverrideFormOpen(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('addOverride')}
            </Button>
          </div>

          {loadingThresholds ? (
            <Skeleton className="h-32 w-full" />
          ) : overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t('noOverrides')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('fieldOrderType')}</TableHead>
                  <TableHead className="text-right">
                    {t('fieldMarginAmber')}
                  </TableHead>
                  <TableHead className="text-right">{t('fieldMarginRed')}</TableHead>
                  <TableHead className="text-right">
                    {t('fieldProductivityAmber')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('fieldProductivityRed')}
                  </TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((override) => {
                  const ot = override.orderTypeId
                    ? orderTypeMap.get(override.orderTypeId)
                    : null
                  const label = ot
                    ? `${ot.code} - ${ot.name}`
                    : override.orderTypeId ?? '-'
                  return (
                    <TableRow key={override.id}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {override.marginAmberFromPercent}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {override.marginRedFromPercent}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {override.productivityAmberFromPercent}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {override.productivityRedFromPercent}%
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditOverride(override)
                            setOverrideFormOpen(true)
                          }}
                          className="mr-2"
                        >
                          {t('editOverride')}
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setDeleteOverride(override)}
                          aria-label={t('deleteOverride')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Override Form Sheet */}
      <NkThresholdOverrideFormSheet
        open={overrideFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            setOverrideFormOpen(false)
            setEditOverride(null)
          }
        }}
        override={
          editOverride && editOverride.orderTypeId != null
            ? {
                id: editOverride.id,
                orderTypeId: editOverride.orderTypeId,
                marginAmberFromPercent: editOverride.marginAmberFromPercent,
                marginRedFromPercent: editOverride.marginRedFromPercent,
                productivityAmberFromPercent: editOverride.productivityAmberFromPercent,
                productivityRedFromPercent: editOverride.productivityRedFromPercent,
              }
            : null
        }
        onSuccess={() => {
          setOverrideFormOpen(false)
          setEditOverride(null)
        }}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteOverride}
        onOpenChange={(open) => {
          if (!open) setDeleteOverride(null)
        }}
        title={t('deleteOverride')}
        description={
          deleteOverride
            ? t('deleteOverrideConfirm', {
                name:
                  (deleteOverride.orderTypeId &&
                    orderTypeMap.get(deleteOverride.orderTypeId)?.name) ??
                  deleteOverride.orderTypeId ?? '-',
              })
            : ''
        }
        confirmLabel={t('deleteOverride')}
        variant="destructive"
        isLoading={removeOverrideMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </section>
  )
}

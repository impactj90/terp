'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import {
  useSystemExportTemplates,
  useCopySystemExportTemplate,
} from '@/hooks/use-system-export-templates'

interface CopyTarget {
  id: string
  name: string
}

const TARGET_LABEL: Record<string, string> = {
  datev_lodas: 'DATEV LODAS',
  datev_lug: 'DATEV LuG',
  lexware: 'Lexware',
  sage: 'SAGE',
  custom: 'Universal',
}

export default function ExportTemplateLibraryPage() {
  const listQuery = useSystemExportTemplates(true)
  const copyMutation = useCopySystemExportTemplate()
  const [copyTarget, setCopyTarget] = React.useState<CopyTarget | null>(null)
  const [lastCopied, setLastCopied] = React.useState<string | null>(null)

  const templates = listQuery.data ?? []

  const onConfirmCopy = async () => {
    if (!copyTarget) return
    try {
      const created = await copyMutation.mutateAsync({
        systemTemplateId: copyTarget.id,
      })
      if (created?.name) {
        setLastCopied(created.name)
        toast.success(`Template "${created.name}" wurde in Ihre Templates kopiert.`)
      }
      setCopyTarget(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`Kopieren fehlgeschlagen: ${message}`)
    }
  }

  return (
    <div className="space-y-6" data-testid="export-template-library-page">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-2">
            <Link
              href="/admin/export-templates"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-1 h-3 w-3" /> Zurück zu meinen Templates
            </Link>
          </div>
          <h1 className="text-2xl font-bold">Template-Bibliothek</h1>
          <p className="text-muted-foreground">
            Mitgelieferte Standard-Templates für DATEV LODAS, LuG, Lexware,
            SAGE und generische CSV-Exporte. Wählen Sie &quot;Als Vorlage
            verwenden&quot;, um das Template in Ihre eigenen Templates zu
            kopieren. Die Kopie ist anschliessend editierbar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {listQuery.isLoading && (
          <div className="col-span-full p-8 text-center text-sm text-muted-foreground">
            Lade Templates...
          </div>
        )}

        {!listQuery.isLoading &&
          templates.map((t) => (
            <Card
              key={t.id}
              data-testid={`system-template-card-${t.id}`}
              className="flex flex-col"
            >
              <CardContent className="flex flex-1 flex-col p-6">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="text-lg font-semibold leading-tight">
                    {t.name}
                  </h3>
                  <Badge variant="outline">
                    {TARGET_LABEL[t.targetSystem] ?? t.targetSystem}
                  </Badge>
                </div>
                <p className="mb-4 flex-1 text-sm text-muted-foreground">
                  {t.description ?? '—'}
                </p>
                <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Encoding: {t.encoding}</span>
                  <span>•</span>
                  <span>Zeilenende: {t.lineEnding.toUpperCase()}</span>
                  <span>•</span>
                  <span>Trenner: {t.fieldSeparator}</span>
                </div>
                <div className="flex items-center justify-between">
                  {lastCopied === t.name ? (
                    <span className="inline-flex items-center text-xs text-green-600">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Kopiert
                    </span>
                  ) : (
                    <span />
                  )}
                  <Button
                    onClick={() => setCopyTarget({ id: t.id, name: t.name })}
                    data-testid={`system-template-copy-${t.id}`}
                    size="sm"
                  >
                    <Copy className="mr-2 h-4 w-4" /> Als Vorlage verwenden
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      <ConfirmDialog
        open={!!copyTarget}
        onOpenChange={(open) => {
          if (!open) setCopyTarget(null)
        }}
        title="Template kopieren"
        description={
          copyTarget
            ? `Das Template "${copyTarget.name}" wird in Ihre eigenen Export-Templates kopiert. Die Kopie ist anschliessend editierbar. Bestehende Templates mit demselben Namen werden nicht überschrieben — die Kopie erhält den Zusatz "(Kopie)".`
            : ''
        }
        confirmLabel="Kopieren"
        isLoading={copyMutation.isPending}
        onConfirm={onConfirmCopy}
      />
    </div>
  )
}

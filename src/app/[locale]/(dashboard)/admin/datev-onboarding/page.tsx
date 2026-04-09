'use client'

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, XCircle, AlertCircle, Download } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useDatevOnboardingStatus } from '@/hooks/use-datev-onboarding'
import { useTRPC } from '@/trpc'
import { useQueryClient } from '@tanstack/react-query'

function StatusLine({
  label,
  ok,
  helpText,
}: {
  label: string
  ok: boolean
  helpText?: string
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 text-red-500" />
      )}
      <div>
        <div className="font-medium" data-testid={`onboarding-${label}`}>
          {label}
        </div>
        {helpText && !ok && (
          <div className="text-sm text-muted-foreground">{helpText}</div>
        )}
      </div>
    </div>
  )
}

export default function DatevOnboardingPage() {
  const { data, isLoading } = useDatevOnboardingStatus()
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const onDownloadPdf = async () => {
    try {
      const result = await queryClient.fetchQuery(
        trpc.datevOnboarding.generatePdf.queryOptions(),
      )
      if (!result) return
      const binary = atob(result.contentBase64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: result.contentType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`PDF-Download fehlgeschlagen: ${msg}`)
    }
  }

  return (
    <div className="space-y-6" data-testid="datev-onboarding-page">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">DATEV-Onboarding</h1>
          <p className="text-muted-foreground">
            Checkliste für die Einrichtung der DATEV-Lohnexport-Schnittstelle.
            Erfüllen Sie alle Punkte, bevor Sie den ersten Produktivexport
            laufen lassen.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onDownloadPdf}
          data-testid="onboarding-download-pdf"
        >
          <Download className="mr-2 h-4 w-4" /> Steuerberater-PDF
        </Button>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Lade Status...
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 font-semibold">Schnittstellen-Konfiguration</h2>
              <StatusLine
                label="BeraterNr gepflegt"
                ok={data.beraterNrSet}
                helpText="Mindestens eine aktive Export-Schnittstelle benötigt eine Beraternummer (4–7 Ziffern). Siehe /admin/export-interfaces."
              />
              <StatusLine
                label="MandantNr gepflegt"
                ok={data.mandantNumberSet}
                helpText="Mindestens eine aktive Export-Schnittstelle benötigt eine Mandantennummer."
              />
              <StatusLine
                label="Aktives Template vorhanden"
                ok={data.hasActiveTemplate}
                helpText="Legen Sie ein eigenes Template an oder kopieren Sie eines aus der Template-Bibliothek."
              />
              <StatusLine
                label="Default-Template auf Schnittstelle gesetzt"
                ok={data.hasDefaultTemplate}
                helpText="Öffnen Sie eine Export-Schnittstelle und wählen Sie ein Default-Template."
              />
              <StatusLine
                label="Test-/Produktivexport bereits ausgeführt"
                ok={data.templateTestedOrRun}
                helpText="Führen Sie einmal den Export durch, um die Verbindung zu verifizieren."
              />
              <StatusLine
                label="Lohnart-Mapping angepasst"
                ok={data.wagesCustomized}
                helpText="Besprechen Sie die Lohnart-Nummern mit Ihrem Steuerberater und passen Sie das Mapping an. Siehe /admin/payroll-wages."
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Mitarbeiter-Vollständigkeit</h2>
                <div
                  className="text-sm text-muted-foreground"
                  data-testid="onboarding-complete-counter"
                >
                  {data.completeEmployees} / {data.totalEmployees} vollständig
                </div>
              </div>

              {data.incompleteEmployees.length === 0 ? (
                <div className="flex items-center text-sm text-green-700">
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Alle aktiven
                  Mitarbeiter haben vollständige Lohnstammdaten.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-amber-700">
                    <AlertCircle className="mr-2 h-4 w-4" />
                    {data.incompleteEmployees.length} Mitarbeiter haben fehlende
                    Pflichtfelder:
                  </div>
                  <div
                    className="max-h-80 overflow-y-auto rounded border"
                    data-testid="onboarding-incomplete-list"
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left">
                          <th className="p-2">Pers.-Nr.</th>
                          <th className="p-2">Name</th>
                          <th className="p-2">Fehlende Felder</th>
                          <th className="p-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.incompleteEmployees.map((emp) => (
                          <tr key={emp.id} className="border-b">
                            <td className="p-2">{emp.personnelNumber}</td>
                            <td className="p-2">
                              {emp.firstName} {emp.lastName}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {emp.missingFields.join(', ')}
                            </td>
                            <td className="p-2 text-right">
                              <Button variant="link" size="sm" asChild>
                                <Link href={`/admin/employees/${emp.id}`}>
                                  Öffnen
                                </Link>
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

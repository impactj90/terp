'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGenerateQrPdf } from '@/hooks/use-service-objects'

interface Props {
  ids: string[]
  format?: 'AVERY_L4736' | 'AVERY_L4731'
}

export function QrLabelButton({ ids, format = 'AVERY_L4736' }: Props) {
  const generate = useGenerateQrPdf()
  const [pending, setPending] = React.useState(false)

  async function handleClick() {
    if (ids.length === 0) return
    setPending(true)
    try {
      const res = await generate.mutateAsync({ ids, format })
      if (res?.signedUrl) {
        window.open(res.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF-Erstellung fehlgeschlagen')
    } finally {
      setPending(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={pending}>
      <QrCode className="mr-2 h-4 w-4" />
      {pending ? 'Erstelle PDF…' : 'QR-Etikett'}
    </Button>
  )
}

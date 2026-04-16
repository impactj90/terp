'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Upload } from 'lucide-react'
import { BankStatementUploadDialog } from '@/components/bank/bank-statement-upload-dialog'

export default function BankStatementsUploadPage() {
  const t = useTranslations('bankInbox')
  const [open, setOpen] = React.useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t('upload.dialogTitle')}
        </h1>
        <p className="text-muted-foreground">{t('upload.fileLabel')}</p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Button onClick={() => setOpen(true)} size="lg">
            <Upload className="mr-2 h-4 w-4" />
            {t('upload.submit')}
          </Button>
        </CardContent>
      </Card>

      <BankStatementUploadDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

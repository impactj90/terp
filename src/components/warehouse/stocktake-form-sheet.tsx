'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useCreateWhStocktake } from '@/hooks'

interface StocktakeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StocktakeFormSheet({ open, onOpenChange }: StocktakeFormSheetProps) {
  const t = useTranslations('warehouseStocktake')
  const createMut = useCreateWhStocktake()

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [scope, setScope] = React.useState('ALL')
  const [notes, setNotes] = React.useState('')

  const resetForm = () => {
    setName('')
    setDescription('')
    setScope('ALL')
    setNotes('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    try {
      await createMut.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        scope: scope as 'ALL' | 'GROUP' | 'LOCATION',
        notes: notes.trim() || null,
      })
      toast.success(t('toastCreated'))
      resetForm()
      onOpenChange(false)
    } catch {
      toast.error(t('errorGeneric'))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('createStocktake')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="st-name">{t('name')}</Label>
            <Input
              id="st-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('name')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="st-description">{t('description')}</Label>
            <Textarea
              id="st-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('description')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="st-scope">{t('scope')}</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('scopeAll')}</SelectItem>
                <SelectItem value="GROUP">{t('scopeGroup')}</SelectItem>
                <SelectItem value="LOCATION">{t('scopeLocation')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="st-notes">{t('notes')}</Label>
            <Textarea
              id="st-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notes')}
              rows={3}
            />
          </div>

          <SheetFooter>
            <Button type="submit" disabled={createMut.isPending || !name.trim()}>
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('createStocktake')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

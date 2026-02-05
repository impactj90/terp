'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useContactTypes,
  useContactKinds,
  useDeleteContactType,
  useDeleteContactKind,
} from '@/hooks/api'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  ContactTypeListPanel,
  ContactKindListPanel,
  ContactTypeFormSheet,
  ContactKindFormSheet,
  ContactTypePageSkeleton,
} from '@/components/contact-types'
import type { components } from '@/lib/api/types'

type ContactType = components['schemas']['ContactType']
type ContactKind = components['schemas']['ContactKind']

export default function ContactTypesPage() {
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])
  const t = useTranslations('adminContactTypes')

  // Contact Types state
  const [selectedType, setSelectedType] = React.useState<ContactType | null>(null)
  const [createTypeOpen, setCreateTypeOpen] = React.useState(false)
  const [editType, setEditType] = React.useState<ContactType | null>(null)
  const [deleteType, setDeleteType] = React.useState<ContactType | null>(null)
  const [deleteTypeError, setDeleteTypeError] = React.useState<string | null>(null)

  // Contact Kinds state
  const [createKindOpen, setCreateKindOpen] = React.useState(false)
  const [editKind, setEditKind] = React.useState<ContactKind | null>(null)
  const [deleteKind, setDeleteKind] = React.useState<ContactKind | null>(null)

  // Data fetching
  const { data: typesData, isLoading: typesLoading } = useContactTypes({
    enabled: !authLoading && isAdmin,
  })
  const contactTypes = typesData?.data ?? []

  const { data: kindsData, isLoading: kindsLoading } = useContactKinds({
    contactTypeId: selectedType?.id,
    enabled: !authLoading && isAdmin && !!selectedType,
  })
  const contactKinds = kindsData?.data ?? []

  // Delete mutations
  const deleteTypeMutation = useDeleteContactType()
  const deleteKindMutation = useDeleteContactKind()

  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard')
    }
  }, [authLoading, isAdmin, router])

  const handleSelectType = (type: ContactType) => {
    setSelectedType(type)
  }

  const handleTypeFormSuccess = () => {
    setCreateTypeOpen(false)
    setEditType(null)
  }

  const handleKindFormSuccess = () => {
    setCreateKindOpen(false)
    setEditKind(null)
  }

  const handleConfirmDeleteType = async () => {
    if (!deleteType) return
    setDeleteTypeError(null)
    try {
      await deleteTypeMutation.mutateAsync({ path: { id: deleteType.id } })
      // If deleted type was selected, clear selection
      if (selectedType?.id === deleteType.id) {
        setSelectedType(null)
      }
      setDeleteType(null)
    } catch (err) {
      const apiError = err as { status?: number; detail?: string; message?: string }
      if (apiError.status === 409) {
        setDeleteTypeError(t('deleteTypeInUse'))
      } else {
        setDeleteTypeError(apiError.detail ?? apiError.message ?? t('failedDelete'))
      }
    }
  }

  const handleConfirmDeleteKind = async () => {
    if (!deleteKind) return
    try {
      await deleteKindMutation.mutateAsync({ path: { id: deleteKind.id } })
      setDeleteKind(null)
    } catch {
      // Error handled by mutation
    }
  }

  if (authLoading) {
    return <ContactTypePageSkeleton />
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Two-panel grid layout */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left panel: Contact Types */}
        <ContactTypeListPanel
          contactTypes={contactTypes}
          isLoading={typesLoading}
          selectedTypeId={selectedType?.id ?? null}
          onSelect={handleSelectType}
          onCreateClick={() => setCreateTypeOpen(true)}
          onEdit={(type) => setEditType(type)}
          onDelete={(type) => {
            setDeleteType(type)
            setDeleteTypeError(null)
          }}
        />

        {/* Right panel: Contact Kinds */}
        <ContactKindListPanel
          contactKinds={contactKinds}
          isLoading={kindsLoading}
          selectedType={selectedType}
          onCreateClick={() => setCreateKindOpen(true)}
          onEdit={(kind) => setEditKind(kind)}
          onDelete={(kind) => setDeleteKind(kind)}
        />
      </div>

      {/* Contact Type Form Sheet */}
      <ContactTypeFormSheet
        open={createTypeOpen || !!editType}
        onOpenChange={(open) => {
          if (!open) {
            setCreateTypeOpen(false)
            setEditType(null)
          }
        }}
        contactType={editType}
        onSuccess={handleTypeFormSuccess}
      />

      {/* Contact Kind Form Sheet */}
      {selectedType && (
        <ContactKindFormSheet
          open={createKindOpen || !!editKind}
          onOpenChange={(open) => {
            if (!open) {
              setCreateKindOpen(false)
              setEditKind(null)
            }
          }}
          contactKind={editKind}
          contactType={selectedType}
          onSuccess={handleKindFormSuccess}
        />
      )}

      {/* Delete Type Confirmation */}
      <ConfirmDialog
        open={!!deleteType}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteType(null)
            setDeleteTypeError(null)
          }
        }}
        title={t('deleteType')}
        description={
          deleteTypeError
            ? deleteTypeError
            : deleteType
              ? t('deleteTypeDescription', { name: deleteType.name })
              : ''
        }
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteTypeMutation.isPending}
        onConfirm={handleConfirmDeleteType}
      />

      {/* Delete Kind Confirmation */}
      <ConfirmDialog
        open={!!deleteKind}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteKind(null)
          }
        }}
        title={t('deleteKind')}
        description={
          deleteKind
            ? t('deleteKindDescription', { label: deleteKind.label })
            : ''
        }
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteKindMutation.isPending}
        onConfirm={handleConfirmDeleteKind}
      />
    </div>
  )
}

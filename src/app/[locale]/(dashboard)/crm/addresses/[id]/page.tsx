'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Edit, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useHasPermission } from '@/hooks'
import {
  useCrmAddress,
  useDeleteCrmAddress,
  useRestoreCrmAddress,
  useDeleteCrmContact,
  useDeleteCrmBankAccount,
} from '@/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AddressFormSheet } from '@/components/crm/address-form-sheet'
import { ContactList } from '@/components/crm/contact-list'
import { ContactFormDialog } from '@/components/crm/contact-form-dialog'
import { BankAccountList } from '@/components/crm/bank-account-list'
import { BankAccountFormDialog } from '@/components/crm/bank-account-form-dialog'
import { CorrespondenceList } from '@/components/crm/correspondence-list'
import { InquiryList } from '@/components/crm/inquiry-list'
import { TaskList } from '@/components/crm/task-list'
import { BillingDocumentList } from '@/components/billing/document-list'
import { ServiceCaseList } from '@/components/billing/service-case-list'

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '—'}</span>
    </div>
  )
}

export default function CrmAddressDetailPage() {
  const t = useTranslations('crmAddresses')
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { allowed: canAccess } = useHasPermission(['crm_addresses.view'])

  const { data: address, isLoading } = useCrmAddress(params.id, canAccess !== false)

  // Dialog state
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  // Contact state
  const [contactFormOpen, setContactFormOpen] = React.useState(false)
  const [editContact, setEditContact] = React.useState<Record<string, unknown> | null>(null)
  const [deleteContact, setDeleteContact] = React.useState<{ id: string; firstName: string; lastName: string } | null>(null)

  // Bank account state
  const [bankFormOpen, setBankFormOpen] = React.useState(false)
  const [editBankAccount, setEditBankAccount] = React.useState<Record<string, unknown> | null>(null)
  const [deleteBankAccount, setDeleteBankAccount] = React.useState<{ id: string } | null>(null)

  const deleteMutation = useDeleteCrmAddress()
  const restoreMutation = useRestoreCrmAddress()
  const deleteContactMutation = useDeleteCrmContact()
  const deleteBankAccountMutation = useDeleteCrmBankAccount()

  const handleDelete = async () => {
    if (!address) return
    try {
      await deleteMutation.mutateAsync({ id: address.id })
      toast.success(t('deactivate'))
      router.push('/crm/addresses')
    } catch {
      toast.error(t('deactivateFailed'))
    }
  }

  const handleRestore = async () => {
    if (!address) return
    try {
      await restoreMutation.mutateAsync({ id: address.id })
      toast.success(t('restore'))
    } catch {
      toast.error(t('deactivateFailed'))
    }
  }

  const handleDeleteContact = async () => {
    if (!deleteContact) return
    try {
      await deleteContactMutation.mutateAsync({ id: deleteContact.id })
      setDeleteContact(null)
    } catch {
      toast.error(t('deactivateFailed'))
    }
  }

  const handleDeleteBankAccount = async () => {
    if (!deleteBankAccount) return
    try {
      await deleteBankAccountMutation.mutateAsync({ id: deleteBankAccount.id })
      setDeleteBankAccount(null)
    } catch {
      toast.error(t('deactivateFailed'))
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!address) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">{t('addressNotFound')}</p>
        <Button variant="outline" onClick={() => router.push('/crm/addresses')}>
          {t('backToList')}
        </Button>
      </div>
    )
  }

  const typeLabel =
    address.type === 'CUSTOMER'
      ? t('typeCustomer')
      : address.type === 'SUPPLIER'
        ? t('typeSupplier')
        : t('typeBoth')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/crm/addresses')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          <div>
            <h1 className="text-2xl font-bold">{address.company}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground font-mono">{address.number}</span>
              <Badge variant={address.type === 'CUSTOMER' ? 'default' : address.type === 'SUPPLIER' ? 'secondary' : 'outline'}>
                {typeLabel}
              </Badge>
              <Badge variant={address.isActive ? 'default' : 'secondary'}>
                {address.isActive ? t('active') : t('inactive')}
              </Badge>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!address.isActive && (
              <Button variant="outline" size="sm" onClick={handleRestore}>
                {t('restore')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              {t('edit')}
            </Button>
            {address.isActive && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('deactivate')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('tabOverview')}</TabsTrigger>
          <TabsTrigger value="contacts">{t('tabContacts')}</TabsTrigger>
          <TabsTrigger value="bankAccounts">{t('tabBankAccounts')}</TabsTrigger>
          <TabsTrigger value="correspondence">{t('tabCorrespondence')}</TabsTrigger>
          <TabsTrigger value="inquiries">{t('tabInquiries')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('tabTasks')}</TabsTrigger>
          <TabsTrigger value="documents">{t('tabDocuments')}</TabsTrigger>
          <TabsTrigger value="serviceCases">{t('tabServiceCases')}</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionAddress')}</h3>
                <div className="divide-y">
                  <DetailRow label={t('labelStreet')} value={address.street} />
                  <DetailRow label={t('labelZip')} value={address.zip} />
                  <DetailRow label={t('labelCity')} value={address.city} />
                  <DetailRow label={t('labelCountry')} value={address.country} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionCommunication')}</h3>
                <div className="divide-y">
                  <DetailRow label={t('labelPhone')} value={address.phone} />
                  <DetailRow label={t('labelFax')} value={address.fax} />
                  <DetailRow label={t('labelEmail')} value={address.email} />
                  <DetailRow label={t('labelWebsite')} value={address.website} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionTax')}</h3>
                <div className="divide-y">
                  <DetailRow label={t('labelTaxNumber')} value={address.taxNumber} />
                  <DetailRow label={t('labelVatId')} value={address.vatId} />
                  <DetailRow label={t('labelMatchCode')} value={address.matchCode} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionPayment')}</h3>
                <div className="divide-y">
                  <DetailRow label={t('labelPaymentTermDays')} value={address.paymentTermDays?.toString()} />
                  <DetailRow label={t('labelDiscountPercent')} value={address.discountPercent?.toString()} />
                  <DetailRow label={t('labelDiscountDays')} value={address.discountDays?.toString()} />
                  <DetailRow label={t('labelDiscountGroup')} value={address.discountGroup} />
                  <DetailRow
                    label={t('labelSalesPriceList')}
                    value={(address as unknown as { salesPriceList?: { name: string } | null }).salesPriceList?.name}
                  />
                  {(address.type === 'SUPPLIER' || address.type === 'BOTH') && (
                    <DetailRow
                      label={t('labelPurchasePriceList')}
                      value={(address as unknown as { purchasePriceList?: { name: string } | null }).purchasePriceList?.name}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {(address.type === 'SUPPLIER' || address.type === 'BOTH') && address.ourCustomerNumber && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionSupplier')}</h3>
                  <div className="divide-y">
                    <DetailRow label={t('labelOurCustomerNumber')} value={address.ourCustomerNumber} />
                  </div>
                </CardContent>
              </Card>
            )}

            {address.notes && (
              <Card className="md:col-span-2">
                <CardContent className="pt-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionNotes')}</h3>
                  <p className="text-sm whitespace-pre-wrap">{address.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="mt-6">
          <ContactList
            contacts={address.contacts ?? []}
            onAdd={() => {
              setEditContact(null)
              setContactFormOpen(true)
            }}
            onEdit={(c) => {
              setEditContact(c as unknown as Record<string, unknown>)
              setContactFormOpen(true)
            }}
            onDelete={(c) =>
              setDeleteContact({ id: c.id, firstName: c.firstName, lastName: c.lastName })
            }
          />
        </TabsContent>

        {/* Bank Accounts Tab */}
        <TabsContent value="bankAccounts" className="mt-6">
          <BankAccountList
            bankAccounts={address.bankAccounts ?? []}
            onAdd={() => {
              setEditBankAccount(null)
              setBankFormOpen(true)
            }}
            onEdit={(b) => {
              setEditBankAccount(b as unknown as Record<string, unknown>)
              setBankFormOpen(true)
            }}
            onDelete={(b) => setDeleteBankAccount({ id: b.id })}
          />
        </TabsContent>

        {/* Correspondence Tab */}
        <TabsContent value="correspondence" className="mt-6">
          <CorrespondenceList addressId={address.id} tenantId={address.tenantId} />
        </TabsContent>

        <TabsContent value="inquiries" className="mt-6">
          <InquiryList addressId={address.id} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <TaskList addressId={address.id} />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <BillingDocumentList addressId={address.id} />
        </TabsContent>

        <TabsContent value="serviceCases" className="mt-6">
          <ServiceCaseList addressId={address.id} />
        </TabsContent>
      </Tabs>

      {/* Edit Sheet */}
      <AddressFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        address={address as Parameters<typeof AddressFormSheet>[0]['address']}
        onSuccess={() => setEditOpen(false)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deactivateAddress')}
        description={t('deactivateDescription', { company: address.company })}
        confirmLabel={t('confirm')}
        onConfirm={handleDelete}
        variant="destructive"
      />

      {/* Contact Form */}
      <ContactFormDialog
        open={contactFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            setContactFormOpen(false)
            setEditContact(null)
          }
        }}
        addressId={address.id}
        contact={editContact as Parameters<typeof ContactFormDialog>[0]['contact']}
        onSuccess={() => {
          setContactFormOpen(false)
          setEditContact(null)
        }}
      />

      {/* Contact Delete */}
      <ConfirmDialog
        open={!!deleteContact}
        onOpenChange={(open) => !open && setDeleteContact(null)}
        title={t('deleteContact')}
        description={t('deleteContactDescription', {
          name: deleteContact ? `${deleteContact.firstName} ${deleteContact.lastName}` : '',
        })}
        confirmLabel={t('confirm')}
        onConfirm={handleDeleteContact}
        variant="destructive"
      />

      {/* Bank Account Form */}
      <BankAccountFormDialog
        open={bankFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBankFormOpen(false)
            setEditBankAccount(null)
          }
        }}
        addressId={address.id}
        bankAccount={editBankAccount as Parameters<typeof BankAccountFormDialog>[0]['bankAccount']}
        onSuccess={() => {
          setBankFormOpen(false)
          setEditBankAccount(null)
        }}
      />

      {/* Bank Account Delete */}
      <ConfirmDialog
        open={!!deleteBankAccount}
        onOpenChange={(open) => !open && setDeleteBankAccount(null)}
        title={t('deleteBankAccount')}
        description={t('deleteBankAccountDescription')}
        confirmLabel={t('confirm')}
        onConfirm={handleDeleteBankAccount}
        variant="destructive"
      />
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/alert'
import { useEmployeeContacts, useDeleteEmployeeContact } from '@/hooks/api'
import { Plus, Users, AlertCircle, CheckCircle } from 'lucide-react'
import { ContactFormDialog } from './contact-form-dialog'
import { ContactListItem } from './contact-list-item'

interface EmergencyContactsCardProps {
  employeeId: string
}

/**
 * Emergency contacts card with CRUD functionality.
 */
export function EmergencyContactsCard({ employeeId }: EmergencyContactsCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: contacts, isLoading, refetch } = useEmployeeContacts(employeeId)
  const deleteContact = useDeleteEmployeeContact()

  // Clear messages after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [successMessage])

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [errorMessage])

  const handleDelete = async (contactId: string) => {
    setDeletingId(contactId)
    setErrorMessage(null)

    try {
      await deleteContact.mutateAsync({
        path: { id: employeeId, contactId },
      })
      setSuccessMessage('Contact deleted successfully')
      refetch()
    } catch {
      setErrorMessage('Failed to delete contact. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleContactCreated = () => {
    setSuccessMessage('Contact added successfully')
    refetch()
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardDescription>Your emergency and other contacts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const contactList = Array.isArray(contacts) ? contacts : []

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardDescription>Your emergency and other contacts</CardDescription>
          <CardAction>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent>
          {successMessage && (
            <Alert className="mb-4 border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              <CheckCircle className="h-4 w-4" />
              <span className="ml-2">{successMessage}</span>
            </Alert>
          )}

          {errorMessage && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <span className="ml-2">{errorMessage}</span>
            </Alert>
          )}

          {contactList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="rounded-full bg-muted p-3">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                No contacts added yet
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Contact
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {contactList.map((contact) => (
                <ContactListItem
                  key={contact.id}
                  contact={contact}
                  onDelete={handleDelete}
                  isDeleting={deletingId === contact.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ContactFormDialog
        employeeId={employeeId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleContactCreated}
      />
    </>
  )
}

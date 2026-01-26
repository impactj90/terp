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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { useUpdateEmployee } from '@/hooks/api'
import { Pencil, X, Check, AlertCircle, CheckCircle } from 'lucide-react'
import type { components } from '@/lib/api/types'

type Employee = components['schemas']['Employee']

interface PersonalInfoCardProps {
  employee: Employee
}

interface FormData {
  first_name: string
  last_name: string
  email: string
  phone: string
}

interface FormErrors {
  first_name?: string
  last_name?: string
  email?: string
}

/**
 * Personal information card with editable fields.
 */
export function PersonalInfoCard({ employee }: PersonalInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const updateEmployee = useUpdateEmployee()

  // Initialize form data when employee changes
  useEffect(() => {
    setFormData({
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
    })
  }, [employee])

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [successMessage])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required'
    } else if (formData.first_name.length > 100) {
      newErrors.first_name = 'First name must be less than 100 characters'
    }

    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required'
    } else if (formData.last_name.length > 100) {
      newErrors.last_name = 'Last name must be less than 100 characters'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleCancel = () => {
    setFormData({
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
    })
    setErrors({})
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!validateForm()) return

    try {
      await updateEmployee.mutateAsync({
        path: { id: employee.id },
        body: {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim() || undefined,
          phone: formData.phone.trim() || undefined,
        },
      })
      setIsEditing(false)
      setSuccessMessage('Personal information updated successfully')
    } catch {
      setErrors({ first_name: 'Failed to save changes. Please try again.' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
        <CardDescription>Your basic personal details</CardDescription>
        <CardAction>
          {isEditing ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={updateEmployee.isPending}
              >
                <X className="mr-1 h-4 w-4" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateEmployee.isPending}
              >
                <Check className="mr-1 h-4 w-4" />
                {updateEmployee.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="mr-1 h-4 w-4" />
              Edit
            </Button>
          )}
        </CardAction>
      </CardHeader>

      <CardContent>
        {successMessage && (
          <Alert className="mb-4 border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle className="h-4 w-4" />
            <span className="ml-2">{successMessage}</span>
          </Alert>
        )}

        {errors.first_name && errors.first_name.includes('Failed') && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <span className="ml-2">{errors.first_name}</span>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* First Name */}
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            {isEditing ? (
              <>
                <Input
                  id="firstName"
                  value={formData.first_name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, first_name: e.target.value }))
                  }
                  className={errors.first_name && !errors.first_name.includes('Failed') ? 'border-destructive' : ''}
                />
                {errors.first_name && !errors.first_name.includes('Failed') && (
                  <p className="text-xs text-destructive">{errors.first_name}</p>
                )}
              </>
            ) : (
              <p className="text-sm font-medium">{employee.first_name}</p>
            )}
          </div>

          {/* Last Name */}
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            {isEditing ? (
              <>
                <Input
                  id="lastName"
                  value={formData.last_name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, last_name: e.target.value }))
                  }
                  className={errors.last_name ? 'border-destructive' : ''}
                />
                {errors.last_name && (
                  <p className="text-xs text-destructive">{errors.last_name}</p>
                )}
              </>
            ) : (
              <p className="text-sm font-medium">{employee.last_name}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            {isEditing ? (
              <>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className={errors.email ? 'border-destructive' : ''}
                  placeholder="email@example.com"
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </>
            ) : (
              <p className="text-sm font-medium">
                {employee.email || <span className="text-muted-foreground">Not set</span>}
              </p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            {isEditing ? (
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+1 234 567 8900"
              />
            ) : (
              <p className="text-sm font-medium">
                {employee.phone || <span className="text-muted-foreground">Not set</span>}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

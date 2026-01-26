'use client'

import { useAuth } from '@/providers/auth-provider'
import { useEmployee } from '@/hooks/api'
import { Skeleton } from '@/components/ui/skeleton'
import { UserX } from 'lucide-react'
import {
  ProfileHeader,
  PersonalInfoCard,
  EmploymentDetailsCard,
  EmergencyContactsCard,
  AccessCardsCard,
  TimePlanCard,
  AccountSettingsCard,
} from '@/components/profile'

export default function ProfilePage() {
  const { user, isLoading: authLoading } = useAuth()
  const employeeId = user?.employee_id

  const { data: employee, isLoading: employeeLoading } = useEmployee(
    employeeId ?? '',
    !!employeeId
  )

  // Show loading state while fetching auth or employee data
  if (authLoading || (employeeId && employeeLoading)) {
    return <ProfileLoadingSkeleton />
  }

  // Show message if no employee is linked to the user
  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
          <p className="text-muted-foreground">
            View and manage your personal information
          </p>
        </div>
        <NoEmployeeLinkedMessage />
      </div>
    )
  }

  // If no employee linked, show limited profile with account settings
  if (!employeeId || !employee) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
          <p className="text-muted-foreground">
            View and manage your personal information
          </p>
        </div>

        {/* User info without employee */}
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-medium">
            {(user.display_name || user.email || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-semibold">{user.display_name || user.email}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <AccountSettingsCard user={user} />
          <NoEmployeeLinkedMessage />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">
          View and manage your personal information
        </p>
      </div>

      {/* Profile Header with Avatar */}
      <ProfileHeader user={user} employee={employee} />

      {/* Personal Info and Employment Details */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PersonalInfoCard employee={employee} />
        <EmploymentDetailsCard employee={employee} />
      </div>

      {/* Contacts and Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        <EmergencyContactsCard employeeId={employeeId} />
        <AccessCardsCard employeeId={employeeId} />
      </div>

      {/* Time Plan and Account Settings */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TimePlanCard employeeId={employeeId} />
        <AccountSettingsCard user={user} />
      </div>
    </div>
  )
}

/**
 * Loading skeleton for the profile page.
 */
function ProfileLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      {/* Profile header skeleton */}
      <div className="flex items-center gap-6">
        <Skeleton className="h-24 w-24 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      {/* Cards grid skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-xl border bg-card py-6">
            <div className="px-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-1 h-4 w-48" />
            </div>
            <div className="mt-6 space-y-4 px-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-1 h-5 w-24" />
                </div>
                <div>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-1 h-5 w-24" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Message shown when no employee is linked to the current user.
 */
function NoEmployeeLinkedMessage() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-12">
      <div className="rounded-full bg-muted p-4">
        <UserX className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">No Employee Profile</h2>
      <p className="mt-2 max-w-md text-center text-muted-foreground">
        Your user account is not linked to an employee record. Please contact
        your administrator to set up your employee profile.
      </p>
      <div className="mt-6 rounded-lg border bg-muted/50 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          <strong>Tip:</strong> Administrators can link your account by matching
          your email address to an employee record or by manually assigning you
          to an employee profile.
        </p>
      </div>
    </div>
  )
}

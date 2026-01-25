'use client'

import { Clock, Users, Calendar, TrendingUp, Shield, Key, User } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { authStorage } from '@/lib/api/client'

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const token = typeof window !== 'undefined' ? authStorage.getToken() : null

  return (
    <div className="space-y-6">
      {/* Auth Debug Card */}
      <div className="rounded-lg border border-green-500/50 bg-green-500/5 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold text-green-700 dark:text-green-400">
            Authentication Status
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Auth State */}
          <div className="rounded-md border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-3 w-3 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">Auth State</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Loading...' : isAuthenticated ? 'Authenticated ✓' : 'Not Authenticated'}
            </p>
          </div>

          {/* User Info */}
          <div className="rounded-md border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Current User</span>
            </div>
            {user ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Name:</strong> {user.display_name}</p>
                <p><strong>Role:</strong> <span className={user.role === 'admin' ? 'text-amber-600 font-medium' : ''}>{user.role}</span></p>
                <p><strong>ID:</strong> <code className="text-[10px] bg-muted px-1 rounded">{user.id}</code></p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No user data</p>
            )}
          </div>

          {/* Token Info */}
          <div className="rounded-md border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">JWT Token</span>
            </div>
            {token ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Status:</strong> <span className="text-green-600">Present ✓</span></p>
                <p><strong>Length:</strong> {token.length} chars</p>
                <p><strong>Preview:</strong></p>
                <code className="block text-[10px] bg-muted px-2 py-1 rounded break-all">
                  {token.substring(0, 50)}...
                </code>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No token in localStorage</p>
            )}
          </div>
        </div>
      </div>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back{user ? `, ${user.display_name}` : ''}! Here&apos;s an overview of your time tracking.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Hours Today"
          value="6:45"
          description="+2:15 from target"
          icon={Clock}
        />
        <StatsCard
          title="Hours This Week"
          value="32:30"
          description="7:30 remaining"
          icon={Calendar}
        />
        <StatsCard
          title="Overtime Balance"
          value="+12:00"
          description="Updated today"
          icon={TrendingUp}
        />
        <StatsCard
          title="Vacation Days"
          value="18"
          description="Days remaining"
          icon={Users}
        />
      </div>

      {/* Recent activity */}
      <div className="rounded-lg border">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
        </div>
        <div className="divide-y">
          <ActivityItem
            title="Clocked in"
            time="Today, 08:15"
            description="Morning shift started"
          />
          <ActivityItem
            title="Break taken"
            time="Today, 12:00 - 12:45"
            description="Lunch break"
          />
          <ActivityItem
            title="Clocked out"
            time="Yesterday, 17:30"
            description="Day completed: 8h 15m"
          />
          <ActivityItem
            title="Absence approved"
            time="2 days ago"
            description="Vacation request for Dec 20-25"
          />
        </div>
      </div>
    </div>
  )
}

interface StatsCardProps {
  title: string
  value: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

function StatsCard({ title, value, description, icon: Icon }: StatsCardProps) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {title}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-2">
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

interface ActivityItemProps {
  title: string
  time: string
  description: string
}

function ActivityItem({ title, time, description }: ActivityItemProps) {
  return (
    <div className="flex items-start gap-4 px-6 py-4">
      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{title}</p>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

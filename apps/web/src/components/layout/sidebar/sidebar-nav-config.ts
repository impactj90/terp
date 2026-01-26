import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Clock,
  Calendar,
  CalendarDays,
  Users,
  Building2,
  Briefcase,
  Settings,
  FileText,
  CalendarOff,
  Palmtree,
  UserCog,
  Shield,
} from 'lucide-react'
import type { UserRole } from '@/hooks/use-has-role'

/**
 * Navigation item configuration
 */
export interface NavItem {
  /** Display title */
  title: string
  /** Navigation href */
  href: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Required roles to see this item (if undefined, all roles can see) */
  roles?: UserRole[]
  /** Optional badge count */
  badge?: number
  /** Optional description for accessibility */
  description?: string
}

/**
 * Navigation section configuration
 */
export interface NavSection {
  /** Section title (shown when expanded) */
  title: string
  /** Required roles to see this section (if undefined, all roles can see) */
  roles?: UserRole[]
  /** Navigation items in this section */
  items: NavItem[]
}

/**
 * Main navigation configuration.
 * Organized by sections for better user experience.
 */
export const navConfig: NavSection[] = [
  {
    title: 'Main',
    items: [
      {
        title: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        description: 'Overview and quick stats',
      },
      {
        title: 'Time Clock',
        href: '/time-clock',
        icon: Clock,
        description: 'Clock in and out',
      },
      {
        title: 'Timesheet',
        href: '/timesheet',
        icon: Calendar,
        description: 'View and edit time entries',
      },
      {
        title: 'Absences',
        href: '/absences',
        icon: CalendarOff,
        description: 'Request and view absences',
      },
      {
        title: 'Vacation',
        href: '/vacation',
        icon: Palmtree,
        description: 'View vacation balance and history',
      },
    ],
  },
  {
    title: 'Management',
    roles: ['admin'],
    items: [
      {
        title: 'Employees',
        href: '/admin/employees',
        icon: Users,
        roles: ['admin'],
        description: 'Manage employee records',
      },
      {
        title: 'Departments',
        href: '/admin/departments',
        icon: Building2,
        roles: ['admin'],
        description: 'Manage departments',
      },
      {
        title: 'Employment Types',
        href: '/admin/employment-types',
        icon: Briefcase,
        roles: ['admin'],
        description: 'Configure employment types',
      },
      {
        title: 'Day Plans',
        href: '/admin/day-plans',
        icon: CalendarDays,
        roles: ['admin'],
        description: 'Configure work schedules',
      },
    ],
  },
  {
    title: 'Administration',
    roles: ['admin'],
    items: [
      {
        title: 'Users',
        href: '/admin/users',
        icon: UserCog,
        roles: ['admin'],
        description: 'Manage user accounts',
      },
      {
        title: 'Reports',
        href: '/admin/reports',
        icon: FileText,
        roles: ['admin'],
        description: 'View and export reports',
      },
      {
        title: 'Settings',
        href: '/admin/settings',
        icon: Settings,
        roles: ['admin'],
        description: 'System settings',
      },
      {
        title: 'Tenants',
        href: '/admin/tenants',
        icon: Shield,
        roles: ['admin'],
        description: 'Manage organizations',
      },
    ],
  },
]

/**
 * Mobile bottom navigation items.
 * Limited to 5 items for optimal mobile UX.
 */
export const mobileNavItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Time',
    href: '/time-clock',
    icon: Clock,
  },
  {
    title: 'Timesheet',
    href: '/timesheet',
    icon: Calendar,
  },
  {
    title: 'Absences',
    href: '/absences',
    icon: CalendarOff,
  },
]

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Clock,
  Calendar,
  CalendarDays,
  CalendarRange,
  CalendarHeart,
  ClipboardCheck,
  ClipboardList,
  Users,
  UsersRound,
  Building2,
  Briefcase,
  Landmark,
  MapPin,
  Settings,
  FileText,
  CalendarOff,
  Palmtree,
  UserCog,
  Shield,
  ShieldCheck,
  ScrollText,
  Wallet,
  AlertTriangle,
  CalendarCheck,
  FileOutput,
  Settings2,
  BarChart3,
  FileClock,
  Contact,
  Calculator,
  Umbrella,
  Layers,
  Package,
  Timer,
  Repeat,
  DoorOpen,
  Terminal,
} from 'lucide-react'

/**
 * Navigation item configuration
 */
export interface NavItem {
  /** Translation key in 'nav' namespace */
  titleKey: string
  /** Navigation href */
  href: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Required permissions to see this item (if undefined, all users can see) */
  permissions?: string[]
  /** Optional badge count */
  badge?: number
}

/**
 * Navigation section configuration
 */
export interface NavSection {
  /** Translation key in 'nav' namespace */
  titleKey: string
  /** Navigation items in this section */
  items: NavItem[]
}

/**
 * Main navigation configuration.
 * Organized by sections for better user experience.
 */
export const navConfig: NavSection[] = [
  {
    titleKey: 'main',
    items: [
      {
        titleKey: 'dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
      },
      {
        titleKey: 'teamOverview',
        href: '/team-overview',
        icon: UsersRound,
      },
      {
        titleKey: 'timeClock',
        href: '/time-clock',
        icon: Clock,
      },
      {
        titleKey: 'timesheet',
        href: '/timesheet',
        icon: Calendar,
      },
      {
        titleKey: 'absences',
        href: '/absences',
        icon: CalendarOff,
      },
      {
        titleKey: 'vacation',
        href: '/vacation',
        icon: Palmtree,
      },
      {
        titleKey: 'monthlyEvaluation',
        href: '/monthly-evaluation',
        icon: FileText,
      },
      {
        titleKey: 'yearOverview',
        href: '/year-overview',
        icon: CalendarRange,
      },
    ],
  },
  {
    titleKey: 'management',
    items: [
      {
        titleKey: 'approvals',
        href: '/admin/approvals',
        icon: ClipboardCheck,
        permissions: ['absences.approve'],
      },
      {
        titleKey: 'employees',
        href: '/admin/employees',
        icon: Users,
        permissions: ['employees.view'],
      },
      {
        titleKey: 'teams',
        href: '/admin/teams',
        icon: UsersRound,
        permissions: ['teams.manage'],
      },
      {
        titleKey: 'departments',
        href: '/admin/departments',
        icon: Building2,
        permissions: ['departments.manage'],
      },
      {
        titleKey: 'costCenters',
        href: '/admin/cost-centers',
        icon: Landmark,
        permissions: ['departments.manage'],
      },
      {
        titleKey: 'locations',
        href: '/admin/locations',
        icon: MapPin,
        permissions: ['locations.manage'],
      },
      {
        titleKey: 'employmentTypes',
        href: '/admin/employment-types',
        icon: Briefcase,
        permissions: ['employees.view'],
      },
      {
        titleKey: 'dayPlans',
        href: '/admin/day-plans',
        icon: CalendarDays,
        permissions: ['day_plans.manage'],
      },
      {
        titleKey: 'weekPlans',
        href: '/admin/week-plans',
        icon: CalendarRange,
        permissions: ['week_plans.manage'],
      },
      {
        titleKey: 'tariffs',
        href: '/admin/tariffs',
        icon: ScrollText,
        permissions: ['tariffs.manage'],
      },
      {
        titleKey: 'holidays',
        href: '/admin/holidays',
        icon: CalendarHeart,
        permissions: ['holidays.manage'],
      },
      {
        titleKey: 'absenceTypes',
        href: '/admin/absence-types',
        icon: CalendarOff,
        permissions: ['absence_types.manage'],
      },
      {
        titleKey: 'bookingTypes',
        href: '/admin/booking-types',
        icon: Clock,
        permissions: ['booking_types.manage'],
      },
      {
        titleKey: 'contactTypes',
        href: '/admin/contact-types',
        icon: Contact,
        permissions: ['contact_management.manage'],
      },
      {
        titleKey: 'calculationRules',
        href: '/admin/calculation-rules',
        icon: Calculator,
        permissions: ['absence_types.manage'],
      },
      {
        titleKey: 'accounts',
        href: '/admin/accounts',
        icon: Wallet,
        permissions: ['accounts.manage'],
      },
      {
        titleKey: 'correctionAssistant',
        href: '/admin/correction-assistant',
        icon: AlertTriangle,
        permissions: ['corrections.manage'],
      },
      {
        titleKey: 'evaluations',
        href: '/admin/evaluations',
        icon: BarChart3,
        permissions: ['reports.view'],
      },
      {
        titleKey: 'monthlyValues',
        href: '/admin/monthly-values',
        icon: CalendarCheck,
        permissions: ['reports.view'],
      },
      {
        titleKey: 'vacationBalances',
        href: '/admin/vacation-balances',
        icon: Palmtree,
        permissions: ['absences.manage'],
      },
      {
        titleKey: 'vacationConfig',
        href: '/admin/vacation-config',
        icon: Umbrella,
        permissions: ['absence_types.manage'],
      },
      {
        titleKey: 'shiftPlanning',
        href: '/admin/shift-planning',
        icon: Layers,
        permissions: ['shift_planning.manage'],
      },
      {
        titleKey: 'orders',
        href: '/admin/orders',
        icon: Package,
        permissions: ['orders.manage'],
      },
    ],
  },
  {
    titleKey: 'administration',
    items: [
      {
        titleKey: 'users',
        href: '/admin/users',
        icon: UserCog,
        permissions: ['users.manage'],
      },
      {
        titleKey: 'userGroups',
        href: '/admin/user-groups',
        icon: ShieldCheck,
        permissions: ['users.manage'],
      },
      {
        titleKey: 'reports',
        href: '/admin/reports',
        icon: FileText,
        permissions: ['reports.view'],
      },
      {
        titleKey: 'auditLogs',
        href: '/admin/audit-logs',
        icon: FileClock,
        permissions: ['users.manage'],
      },
      {
        titleKey: 'settings',
        href: '/admin/settings',
        icon: Settings,
        permissions: ['settings.manage'],
      },
      {
        titleKey: 'tenants',
        href: '/admin/tenants',
        icon: Shield,
        permissions: ['tenants.manage'],
      },
      {
        titleKey: 'payrollExports',
        href: '/admin/payroll-exports',
        icon: FileOutput,
        permissions: ['payroll.view'],
      },
      {
        titleKey: 'exportInterfaces',
        href: '/admin/export-interfaces',
        icon: Settings2,
        permissions: ['payroll.manage'],
      },
      {
        titleKey: 'monthlyEvaluations',
        href: '/admin/monthly-evaluations',
        icon: ClipboardList,
        permissions: ['monthly_evaluations.manage'],
      },
      {
        titleKey: 'schedules',
        href: '/admin/schedules',
        icon: Timer,
        permissions: ['schedules.manage'],
      },
      {
        titleKey: 'macros',
        href: '/admin/macros',
        icon: Repeat,
        permissions: ['macros.manage'],
      },
      {
        titleKey: 'accessControl',
        href: '/admin/access-control',
        icon: DoorOpen,
        permissions: ['access_control.manage'],
      },
      {
        titleKey: 'terminalBookings',
        href: '/admin/terminal-bookings',
        icon: Terminal,
        permissions: ['terminal_bookings.manage'],
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
    titleKey: 'dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    titleKey: 'time',
    href: '/time-clock',
    icon: Clock,
  },
  {
    titleKey: 'timesheet',
    href: '/timesheet',
    icon: Calendar,
  },
  {
    titleKey: 'absences',
    href: '/absences',
    icon: CalendarOff,
  },
]

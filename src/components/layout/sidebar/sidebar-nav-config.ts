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
  Mail,
  BookOpen,
  Warehouse,
  Wrench,
  Tag,
  FileStack,
  Stamp,
  ShoppingCart,
  PackageCheck,
  PackageMinus,
  ArrowRightLeft,
  Lock,
  ScanLine,
  FolderOpen,
  ShieldAlert,
  FileInput,
  FileCheck,
  LifeBuoy,
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
  /** Required module to show this item (if undefined, shown regardless of modules) */
  module?: string
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
  /** Required module for this entire section (if undefined, shown regardless of modules) */
  module?: string
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
      {
        titleKey: 'employeeMessages',
        href: '/admin/employee-messages',
        icon: Mail,
        permissions: ['notifications.manage'],
      },
    ],
  },
  {
    titleKey: 'hrSection',
    items: [
      {
        titleKey: 'hrPersonnelFile',
        href: '/hr/personnel-file',
        icon: FolderOpen,
        permissions: ['hr_personnel_file.view'],
      },
      {
        titleKey: 'hrPersonnelFileCategories',
        href: '/hr/personnel-file/categories',
        icon: Tag,
        permissions: ['hr_personnel_file_categories.manage'],
      },
    ],
  },
  {
    titleKey: 'crm',
    module: 'crm',
    items: [
      {
        titleKey: 'crmAddresses',
        href: '/crm/addresses',
        icon: BookOpen,
        module: 'crm',
        permissions: ['crm_addresses.view'],
      },
      {
        titleKey: 'crmInquiries',
        href: '/crm/inquiries',
        icon: FileText,
        module: 'crm',
        permissions: ['crm_inquiries.view'],
      },
      {
        titleKey: 'crmTasks',
        href: '/crm/tasks',
        icon: ClipboardCheck,
        module: 'crm',
        permissions: ['crm_tasks.view'],
      },
      {
        titleKey: 'crmReports',
        href: '/crm/reports',
        icon: BarChart3,
        module: 'crm',
        permissions: ['crm_addresses.view'],
      },
    ],
  },
  {
    titleKey: 'billingSection',
    module: 'billing',
    items: [
      {
        titleKey: 'billingDocuments',
        href: '/orders/documents',
        icon: FileText,
        module: 'billing',
        permissions: ['billing_documents.view'],
      },
      {
        titleKey: 'billingServiceCases',
        href: '/orders/service-cases',
        icon: Wrench,
        module: 'billing',
        permissions: ['billing_service_cases.view'],
      },
      {
        titleKey: 'billingOpenItems',
        href: '/orders/open-items',
        icon: Wallet,
        module: 'billing',
        permissions: ['billing_payments.view'],
      },
      {
        titleKey: 'billingPriceLists',
        href: '/orders/price-lists',
        icon: Tag,
        module: 'billing',
        permissions: ['billing_price_lists.view'],
      },
      {
        titleKey: 'billingRecurringInvoices',
        href: '/orders/recurring',
        icon: Repeat,
        module: 'billing',
        permissions: ['billing_recurring.view'],
      },
      {
        titleKey: 'billingTemplates',
        href: '/orders/templates',
        icon: FileStack,
        module: 'billing',
        permissions: ['billing_documents.view'],
      },
    ],
  },
  {
    titleKey: 'invoicesSection',
    module: 'inbound_invoices',
    items: [
      {
        titleKey: 'inboundInvoices',
        href: '/invoices/inbound',
        icon: FileInput,
        module: 'inbound_invoices',
        permissions: ['inbound_invoices.view'],
      },
      {
        titleKey: 'inboundApprovals',
        href: '/invoices/inbound/approvals',
        icon: FileCheck,
        module: 'inbound_invoices',
        permissions: ['inbound_invoices.approve'],
      },
      {
        titleKey: 'inboundSettings',
        href: '/invoices/inbound/settings',
        icon: Settings2,
        module: 'inbound_invoices',
        permissions: ['inbound_invoices.manage'],
      },
    ],
  },
  {
    titleKey: 'warehouseSection',
    module: 'warehouse',
    items: [
      {
        titleKey: 'warehouseOverview',
        href: '/warehouse',
        icon: Warehouse,
        module: 'warehouse',
      },
      {
        titleKey: 'warehouseArticles',
        href: '/warehouse/articles',
        icon: Package,
        module: 'warehouse',
        permissions: ['wh_articles.view'],
      },
      {
        titleKey: 'warehousePriceLists',
        href: '/warehouse/prices',
        icon: Tag,
        module: 'warehouse',
        permissions: ['billing_price_lists.view'],
      },
      {
        titleKey: 'warehousePurchaseOrders',
        href: '/warehouse/purchase-orders',
        icon: ShoppingCart,
        module: 'warehouse',
        permissions: ['wh_purchase_orders.view'],
      },
      {
        titleKey: 'warehouseGoodsReceipt',
        href: '/warehouse/goods-receipt',
        icon: PackageCheck,
        module: 'warehouse',
        permissions: ['wh_stock.manage'],
      },
      {
        titleKey: 'warehouseWithdrawals',
        href: '/warehouse/withdrawals',
        icon: PackageMinus,
        module: 'warehouse',
        permissions: ['wh_stock.manage'],
      },
      {
        titleKey: 'warehouseStockMovements',
        href: '/warehouse/stock-movements',
        icon: ArrowRightLeft,
        module: 'warehouse',
        permissions: ['wh_stock.view'],
      },
      {
        titleKey: 'warehouseSupplierInvoices',
        href: '/warehouse/supplier-invoices',
        icon: Stamp,
        module: 'warehouse',
        permissions: ['wh_supplier_invoices.view'],
      },
      {
        titleKey: 'warehouseReservations',
        href: '/warehouse/reservations',
        icon: Lock,
        module: 'warehouse',
        permissions: ['wh_reservations.view'],
      },
      {
        titleKey: 'warehouseStocktake',
        href: '/warehouse/stocktake',
        icon: ClipboardList,
        module: 'warehouse',
        permissions: ['wh_stocktake.view'],
      },
      {
        titleKey: 'warehouseScanner',
        href: '/warehouse/scanner',
        icon: ScanLine,
        module: 'warehouse',
        permissions: ['wh_qr.scan'],
      },
      {
        titleKey: 'warehouseCorrections',
        href: '/warehouse/corrections',
        icon: AlertTriangle,
        module: 'warehouse',
        permissions: ['wh_corrections.view'],
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
      // ─────────────────────────────────────────────────────────────
      // TODO(ExportInterface-Abbau): Sidebar-Eintrag "exportInterfaces"
      // wurde am 2026-04-09 aus der Navigation entfernt, weil die
      // Tabelle `export_interfaces` eine ZMI-Legacy-Konstruktion ist,
      // die durch die Template-Engine grösstenteils überflüssig wurde.
      //
      // Noch offen (bewusste Nicht-Entscheidung, später angehen):
      //   1. beraterNr + mandantenNr + defaultTemplateId auf den
      //      Tenant verschieben
      //   2. Legacy-CSV-Export (`payroll-export-service.ts`) stilllegen
      //   3. ExportInterfaceAccount-Junction entfernen
      //   4. Tabellen `export_interfaces` + `export_interface_accounts`
      //      und die zugehörigen Services/Router/UI/Tests löschen
      //   5. Route `/admin/export-interfaces` entfernen
      //   6. i18n-Key `nav.exportInterfaces` + `adminExportInterfaces`
      //      aufräumen
      //
      // Hintergrund: siehe Diskussion Phase 3 Abschluss 2026-04-09 und
      // `thoughts/shared/research/2026-04-08-export-script-konzept-lohnschnittstelle.md`.
      // Die Route existiert weiterhin (kein Breaking Change), nur der
      // Nav-Eintrag fehlt. Direktaufruf via URL funktioniert noch.
      // ─────────────────────────────────────────────────────────────
      {
        titleKey: 'exportTemplates',
        href: '/admin/export-templates',
        icon: FileStack,
        permissions: ['export_template.view'],
      },
      {
        titleKey: 'exportTemplateSchedules',
        href: '/admin/export-templates/schedules',
        icon: FileStack,
        permissions: ['export_template.schedule'],
      },
      {
        titleKey: 'payrollWages',
        href: '/admin/payroll-wages',
        icon: Tag,
        permissions: ['personnel.payroll_data.view'],
      },
      {
        titleKey: 'payrollBulkImport',
        href: '/admin/payroll-import',
        icon: FileInput,
        permissions: ['personnel.payroll_data.edit'],
      },
      {
        titleKey: 'datevOnboarding',
        href: '/admin/datev-onboarding',
        icon: FileCheck,
        permissions: ['payroll.view'],
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
        titleKey: 'supportAccess',
        href: '/admin/settings/support-access',
        icon: LifeBuoy,
        permissions: ['platform.support_access.grant'],
      },
      {
        titleKey: 'terminalBookings',
        href: '/admin/terminal-bookings',
        icon: Terminal,
        permissions: ['terminal_bookings.manage'],
      },
      {
        titleKey: 'billingConfig',
        href: '/admin/billing-config',
        icon: Stamp,
        module: 'billing',
        permissions: ['billing_documents.edit'],
      },
      {
        titleKey: 'dsgvoRetention',
        href: '/admin/dsgvo',
        icon: ShieldAlert,
        permissions: ['dsgvo.view'],
      },
      {
        titleKey: 'emailSettings',
        href: '/admin/email-settings',
        icon: Mail,
        permissions: ['email_smtp.view'],
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

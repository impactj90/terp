// Media query / responsive hooks
export { useMediaQuery, useIsMobile } from './use-media-query'

// Auth hooks (User type re-exported from auth-provider for backward compatibility)
export { type User } from './use-auth'
export {
  useHasRole,
  useHasMinRole,
  useUserRole,
  USER_ROLES,
  type UserRole,
} from './use-has-role'
export { useHasPermission, usePermissionChecker } from './use-has-permission'

// Domain-specific API hooks

// Employees
export {
  useEmployees,
  useEmployee,
  useEmployeeSearch,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useBulkAssignTariff,
} from './use-employees'

// Bookings
export {
  useBookings,
  useBooking,
  useCreateBooking,
  useUpdateBooking,
  useDeleteBooking,
} from './use-bookings'

// Booking Types
export {
  useBookingTypes,
  useBookingType,
  useCreateBookingType,
  useUpdateBookingType,
  useDeleteBookingType,
} from './use-booking-types'

// Daily Values
export {
  useDailyValues,
  useAllDailyValues,
  useApproveDailyValue,
  type DailyValue,
} from './use-daily-values'

// Monthly Values
export {
  useMonthlyValues,
  useYearOverview,
  useCloseMonth,
  useReopenMonth,
  useRecalculateMonth,
  type MonthSummary,
} from './use-monthly-values'

// Vacation Balances
export {
  useVacationBalances,
  useVacationBalance,
  useEmployeeVacationBalance,
  useCreateVacationBalance,
  useUpdateVacationBalance,
  useInitializeVacationBalances,
} from './use-vacation-balance'

// Employee Day View
export { useEmployeeDayView, useCalculateDay } from './use-employee-day'

// Employee Contacts
export {
  useEmployeeContacts,
  useCreateEmployeeContact,
  useDeleteEmployeeContact,
} from './use-employee-contacts'

// Employee Cards
export {
  useEmployeeCards,
  useCreateEmployeeCard,
  useDeactivateEmployeeCard,
} from './use-employee-cards'

// Users
export { useUser, useUpdateUser } from './use-user'
export { useUsers, useCreateUser, useDeleteUser, useChangeUserPassword } from './use-users'
export {
  useUserGroups,
  useUserGroup,
  useCreateUserGroup,
  useUpdateUserGroup,
  useDeleteUserGroup,
} from './use-user-groups'
export { usePermissions } from './use-permissions'
export { useCurrentPermissions } from './use-current-permissions'
export { useModules } from './use-modules'

// Notifications
export {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from './use-notifications'
export { useUnreadCount } from './use-unread-count'

// Absences
export {
  useAbsences,
  useEmployeeAbsences,
  useAbsence,
  useCreateAbsenceRange,
  useUpdateAbsence,
  useDeleteAbsence,
  useApproveAbsence,
  useRejectAbsence,
  useCancelAbsence,
} from './use-absences'

// Absence Types (tRPC)
export {
  useAbsenceTypes,
  useAbsenceType,
  useCreateAbsenceType,
  useUpdateAbsenceType,
  useDeleteAbsenceType,
} from './use-absence-types'

// Holidays
export {
  useHolidays,
  useHoliday,
  useCreateHoliday,
  useUpdateHoliday,
  useDeleteHoliday,
  useGenerateHolidays,
  useCopyHolidays,
} from './use-holidays'

// Departments
export {
  useDepartments,
  useDepartment,
  useDepartmentTree,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from './use-departments'

// Cost Centers
export {
  useCostCenters,
  useCostCenter,
  useCreateCostCenter,
  useUpdateCostCenter,
  useDeleteCostCenter,
} from './use-cost-centers'

// Locations
export {
  useLocations,
  useLocation,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from './use-locations'

// Employment Types
export {
  useEmploymentTypes,
  useEmploymentType,
  useCreateEmploymentType,
  useUpdateEmploymentType,
  useDeleteEmploymentType,
} from './use-employment-types'

// Teams
export {
  useTeams,
  useTeam,
  useMyTeams,
  useMyTeam,
  useTeamMembers,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useAddTeamMember,
  useUpdateTeamMember,
  useRemoveTeamMember,
} from './use-teams'

// Day Plans
export {
  useDayPlans,
  useDayPlan,
  useCreateDayPlan,
  useUpdateDayPlan,
  useDeleteDayPlan,
  useCopyDayPlan,
  useCreateDayPlanBreak,
  useDeleteDayPlanBreak,
  useCreateDayPlanBonus,
  useUpdateDayPlanBonus,
  useDeleteDayPlanBonus,
} from './use-day-plans'

// Week Plans
export {
  useWeekPlans,
  useWeekPlan,
  useCreateWeekPlan,
  useUpdateWeekPlan,
  useDeleteWeekPlan,
} from './use-week-plans'

// Tariffs
export {
  useTariffs,
  useTariff,
  useCreateTariff,
  useUpdateTariff,
  useDeleteTariff,
  useCreateTariffBreak,
  useDeleteTariffBreak,
} from './use-tariffs'

// Employee Tariff Assignments
export {
  useEmployeeTariffAssignments,
  useEmployeeTariffAssignment,
  useCreateEmployeeTariffAssignment,
  useUpdateEmployeeTariffAssignment,
  useDeleteEmployeeTariffAssignment,
  useEffectiveTariff,
} from './use-employee-tariff-assignments'

// Team Overview
export { useTeamDayViews } from './use-team-day-views'
export { useTeamDailyValues } from './use-team-daily-values'

// Employee Day Plans
export {
  useEmployeeDayPlans,
  useEmployeeDayPlansForEmployee,
  useCreateEmployeeDayPlan,
  useUpdateEmployeeDayPlan,
  useBulkCreateEmployeeDayPlans,
  useDeleteEmployeeDayPlanRange,
  useDeleteEmployeeDayPlan,
  useGenerateFromTariff,
} from './use-employee-day-plans'

// Admin Monthly Values (flat routes)
export {
  useAdminMonthlyValues,
  useMonthlyValueById,
  useCloseMonthById,
  useReopenMonthById,
  useCloseMonthBatch,
  useRecalculateMonthlyValues,
} from './use-admin-monthly-values'

// Correction Assistant
export {
  useCorrectionAssistantItems,
  useCorrectionMessages,
  useCorrectionMessage,
  useUpdateCorrectionMessage,
  type CorrectionAssistantItem,
  type CorrectionAssistantError,
  type CorrectionAssistantList,
  type CorrectionMessage,
  type CorrectionMessageList,
  type UpdateCorrectionMessageRequest,
} from './use-correction-assistant'

// Payroll Exports
export {
  usePayrollExports,
  usePayrollExport,
  usePayrollExportPreview,
  useExportInterfaces,
  useGeneratePayrollExport,
  useDeletePayrollExport,
  useDownloadPayrollExport,
  type PayrollExportLine,
  type PayrollExportPreview,
} from './use-payroll-exports'

// Payroll Wages (Lohnart-Mapping, Phase 2)
export {
  usePayrollWages,
  useDefaultPayrollWages,
  useInitializePayrollWages,
  useUpdatePayrollWage,
  useResetPayrollWages,
} from './use-payroll-wages'

// Export Templates (Phase 2)
export {
  useExportTemplates,
  useExportTemplate,
  useExportTemplateVersions,
  useCreateExportTemplate,
  useUpdateExportTemplate,
  useDeleteExportTemplate,
  usePreviewExportTemplate,
  useTestExportTemplate,
} from './use-export-templates'

// System Export Templates (Phase 3 — standard-template library)
export {
  useSystemExportTemplates,
  useSystemExportTemplate,
  useCopySystemExportTemplate,
} from './use-system-export-templates'

// Payroll Bulk Import (Phase 3)
export {
  useParsePayrollBulkFile,
  useConfirmPayrollBulkImport,
} from './use-payroll-bulk-import'

// Employee Salary History (Phase 3)
export {
  useEmployeeSalaryHistory,
  useCreateSalaryHistoryEntry,
  useUpdateSalaryHistoryEntry,
  useDeleteSalaryHistoryEntry,
} from './use-employee-salary-history'

// DATEV Onboarding status (Phase 3)
export { useDatevOnboardingStatus } from './use-datev-onboarding'

// Export Interfaces (admin CRUD)
export {
  useExportInterfaces as useExportInterfacesList,
  useExportInterface,
  useExportInterfaceAccounts,
  useCreateExportInterface,
  useUpdateExportInterface,
  useDeleteExportInterface,
  useSetExportInterfaceAccounts,
} from './use-export-interfaces'

// Monthly Evaluation Templates (admin CRUD)
export {
  useMonthlyEvaluations,
  useMonthlyEvaluation,
  useDefaultMonthlyEvaluation,
  useCreateMonthlyEvaluation,
  useUpdateMonthlyEvaluation,
  useDeleteMonthlyEvaluation,
  useSetDefaultMonthlyEvaluation,
} from './use-monthly-evaluations'

// Reports
export {
  useReports,
  useReport,
  useGenerateReport,
  useDeleteReport,
  useDownloadReport,
} from './use-reports'

// Evaluations
export {
  useEvaluationDailyValues,
  useEvaluationBookings,
  useEvaluationTerminalBookings,
  useEvaluationLogs,
  useEvaluationWorkflowHistory,
} from './use-evaluations'

// Audit Logs
export {
  useAuditLogs,
  useAuditLog,
  useExportAuditLogsCsv,
  useExportAuditLogsPdf,
} from './use-audit-logs'

// System Settings
export {
  useSystemSettings,
  useUpdateSystemSettings,
  useCleanupDeleteBookings,
  useCleanupDeleteBookingData,
  useCleanupReReadBookings,
  useCleanupMarkDeleteOrders,
} from './use-system-settings'

// Tenants
export {
  useTenants,
  useTenant,
  useCreateTenant,
  useUpdateTenant,
  useDeactivateTenant,
  useSupportSessions,
  useActiveSupportSession,
  useRequestSupportAccess,
  useRevokeSupportAccess,
} from './use-tenants'

// Demo Self-Service (tenant-side /demo-expired page)
// Admin-side demo lifecycle moved to platform-admin; see
// /platform/tenants/demo.
export { useRequestConvertFromExpired } from './use-demo-self-service'

// Booking Type Groups
export {
  useBookingTypeGroups,
  useBookingTypeGroup,
  useCreateBookingTypeGroup,
  useUpdateBookingTypeGroup,
  useDeleteBookingTypeGroup,
} from './use-booking-type-groups'

// Booking Reasons
export {
  useBookingReasons,
  useBookingReason,
  useCreateBookingReason,
  useUpdateBookingReason,
  useDeleteBookingReason,
} from './use-booking-reasons'

// Absence Type Groups
export {
  useAbsenceTypeGroups,
  useAbsenceTypeGroup,
  useCreateAbsenceTypeGroup,
  useUpdateAbsenceTypeGroup,
  useDeleteAbsenceTypeGroup,
} from './use-absence-type-groups'

// Calculation Rules
export {
  useCalculationRules,
  useCalculationRule,
  useCreateCalculationRule,
  useUpdateCalculationRule,
  useDeleteCalculationRule,
} from './use-calculation-rules'

// Vacation Config
export {
  useVacationSpecialCalculations,
  useVacationSpecialCalculation,
  useCreateVacationSpecialCalculation,
  useUpdateVacationSpecialCalculation,
  useDeleteVacationSpecialCalculation,
  useVacationCalculationGroups,
  useVacationCalculationGroup,
  useCreateVacationCalculationGroup,
  useUpdateVacationCalculationGroup,
  useDeleteVacationCalculationGroup,
  useVacationCappingRules,
  useVacationCappingRule,
  useCreateVacationCappingRule,
  useUpdateVacationCappingRule,
  useDeleteVacationCappingRule,
  useVacationCappingRuleGroups,
  useVacationCappingRuleGroup,
  useCreateVacationCappingRuleGroup,
  useUpdateVacationCappingRuleGroup,
  useDeleteVacationCappingRuleGroup,
  useEmployeeCappingExceptions,
  useEmployeeCappingException,
  useCreateEmployeeCappingException,
  useUpdateEmployeeCappingException,
  useDeleteEmployeeCappingException,
  useVacationEntitlementPreview,
  useVacationCarryoverPreview,
} from './use-vacation-config'

// Shift Planning
export {
  useShifts,
  useShift,
  useCreateShift,
  useUpdateShift,
  useDeleteShift,
} from './use-shift-planning'

// Orders
export {
  useOrders,
  useOrder,
  useCreateOrder,
  useUpdateOrder,
  useDeleteOrder,
} from './use-orders'

// Activities
export {
  useActivities,
  useActivity,
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
} from './use-activities'

// Groups (Employee, Workflow, Activity)
export {
  useGroups,
  useGroup,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
} from './use-groups'

// Order Assignments
export {
  useOrderAssignments,
  useOrderAssignmentsByOrder,
  useOrderAssignment,
  useCreateOrderAssignment,
  useUpdateOrderAssignment,
  useDeleteOrderAssignment,
} from './use-order-assignments'

// Order Bookings
export {
  useOrderBookings,
  useOrderBooking,
  useCreateOrderBooking,
  useUpdateOrderBooking,
  useDeleteOrderBooking,
} from './use-order-bookings'

// Corrections
export {
  useCorrections,
  useCorrection,
  useCreateCorrection,
  useUpdateCorrection,
  useDeleteCorrection,
  useApproveCorrection,
  useRejectCorrection,
} from './use-corrections'

// Schedules
export {
  useSchedules,
  useSchedule,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useScheduleTasks,
  useCreateScheduleTask,
  useUpdateScheduleTask,
  useDeleteScheduleTask,
  useExecuteSchedule,
  useScheduleExecutions,
  useScheduleExecution,
  useTaskCatalog,
} from './use-schedules'

// Macros
export {
  useMacros,
  useMacro,
  useCreateMacro,
  useUpdateMacro,
  useDeleteMacro,
  useMacroAssignments,
  useCreateMacroAssignment,
  useUpdateMacroAssignment,
  useDeleteMacroAssignment,
  useExecuteMacro,
  useMacroExecutions,
  useMacroExecution,
} from './use-macros'

// Access Control
export {
  useAccessZones,
  useAccessZone,
  useCreateAccessZone,
  useUpdateAccessZone,
  useDeleteAccessZone,
  useAccessProfiles,
  useAccessProfile,
  useCreateAccessProfile,
  useUpdateAccessProfile,
  useDeleteAccessProfile,
  useEmployeeAccessAssignments,
  useCreateEmployeeAccessAssignment,
  useUpdateEmployeeAccessAssignment,
  useDeleteEmployeeAccessAssignment,
} from './use-access-control'

// Terminal Bookings
export {
  useTerminalBookings,
  useTriggerTerminalImport,
  useImportBatches,
  useImportBatch,
} from './use-terminal-bookings'

// Vehicles
export {
  useVehicles,
  useVehicle,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
} from './use-vehicles'

// Vehicle Routes
export {
  useVehicleRoutes,
  useVehicleRoute,
  useCreateVehicleRoute,
  useUpdateVehicleRoute,
  useDeleteVehicleRoute,
} from './use-vehicle-routes'

// Trip Records
export {
  useTripRecords,
  useTripRecord,
  useCreateTripRecord,
  useUpdateTripRecord,
  useDeleteTripRecord,
} from './use-trip-records'

// Employee Messages
export {
  useEmployeeMessages,
  useEmployeeMessage,
  useEmployeeMessagesForEmployee,
  useCreateEmployeeMessage,
  useSendEmployeeMessage,
} from './use-employee-messages'

// Travel Allowance Rule Sets
export {
  useTravelAllowanceRuleSets,
  useTravelAllowanceRuleSet,
  useCreateTravelAllowanceRuleSet,
  useUpdateTravelAllowanceRuleSet,
  useDeleteTravelAllowanceRuleSet,
} from './use-travel-allowance-rule-sets'

// Local Travel Rules
export {
  useLocalTravelRules,
  useLocalTravelRule,
  useCreateLocalTravelRule,
  useUpdateLocalTravelRule,
  useDeleteLocalTravelRule,
} from './use-local-travel-rules'

// Extended Travel Rules
export {
  useExtendedTravelRules,
  useExtendedTravelRule,
  useCreateExtendedTravelRule,
  useUpdateExtendedTravelRule,
  useDeleteExtendedTravelRule,
} from './use-extended-travel-rules'

// Travel Allowance Preview
export {
  useTravelAllowancePreview,
} from './use-travel-allowance-preview'

// Account Groups
export {
  useAccountGroups,
  useAccountGroup,
  useCreateAccountGroup,
  useUpdateAccountGroup,
  useDeleteAccountGroup,
} from './use-account-groups'

// Accounts
export {
  useAccounts,
  useAccount,
  useAccountUsage,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
} from './use-accounts'

// Daily Account Values
export {
  useAccountValueSummary,
} from './use-daily-account-values'

// Contact Kinds
export {
  useContactKinds,
  useCreateContactKind,
  useUpdateContactKind,
  useDeleteContactKind,
} from './use-contact-kinds'

// Contact Types
export {
  useContactTypes,
  useContactType,
  useCreateContactType,
  useUpdateContactType,
  useDeleteContactType,
} from './use-contact-types'

// CRM Addresses
export {
  useCrmAddresses,
  useCrmAddress,
  useCreateCrmAddress,
  useUpdateCrmAddress,
  useDeleteCrmAddress,
  useRestoreCrmAddress,
  useCrmContacts,
  useCreateCrmContact,
  useUpdateCrmContact,
  useDeleteCrmContact,
  useCrmBankAccounts,
  useCreateCrmBankAccount,
  useUpdateCrmBankAccount,
  useDeleteCrmBankAccount,
  useCrmAddressHierarchy,
  useSetCrmAddressParent,
  useCrmGroupList,
  useCrmGroupStats,
} from './use-crm-addresses'

// CRM Correspondence
export {
  useCrmCorrespondence,
  useCrmCorrespondenceById,
  useCreateCrmCorrespondence,
  useUpdateCrmCorrespondence,
  useDeleteCrmCorrespondence,
} from './use-crm-correspondence'

// CRM Correspondence Attachments
export {
  useCrmCorrespondenceAttachments,
  useUploadCrmCorrespondenceAttachment,
  useDeleteCrmCorrespondenceAttachment,
  useCrmCorrespondenceDownloadUrl,
} from './use-crm-correspondence-attachments'

// CRM Inquiries
export {
  useCrmInquiries,
  useCrmInquiryById,
  useCreateCrmInquiry,
  useUpdateCrmInquiry,
  useCloseCrmInquiry,
  useCancelCrmInquiry,
  useReopenCrmInquiry,
  useLinkCrmInquiryOrder,
  useCreateCrmInquiryOrder,
  useDeleteCrmInquiry,
} from './use-crm-inquiries'

// CRM Tasks
export {
  useCrmTasks,
  useMyTasks,
  useCrmTaskById,
  useCreateCrmTask,
  useUpdateCrmTask,
  useCompleteCrmTask,
  useCancelCrmTask,
  useReopenCrmTask,
  useMarkCrmTaskRead,
  useDeleteCrmTask,
} from './use-crm-tasks'

// CRM Reports
export {
  useCrmOverview,
  useCrmAddressStats,
  useCrmCorrespondenceByPeriod,
  useCrmCorrespondenceByType,
  useCrmInquiryPipeline,
  useCrmInquiryByEffort,
  useCrmTaskCompletion,
  useCrmTasksByAssignee,
} from './use-crm-reports'

// Billing Documents
export {
  useBillingDocuments,
  useBillingDocumentById,
  useCreateBillingDocument,
  useUpdateBillingDocument,
  useDeleteBillingDocument,
  useFinalizeBillingDocument,
  useForwardBillingDocument,
  useCancelBillingDocument,
  useDuplicateBillingDocument,
  useDownloadBillingDocumentPdf,
  useDownloadBillingDocumentXml,
  useGenerateBillingDocumentEInvoice,
  useBillingPositions,
  useAddBillingPosition,
  useUpdateBillingPosition,
  useDeleteBillingPosition,
  useReorderBillingPositions,
} from './use-billing-documents'

// Billing Document Templates
export {
  useBillingDocumentTemplates,
  useBillingDocumentTemplatesByType,
  useDefaultBillingDocumentTemplate,
  useCreateBillingDocumentTemplate,
  useUpdateBillingDocumentTemplate,
  useDeleteBillingDocumentTemplate,
  useSetDefaultBillingDocumentTemplate,
} from './use-billing-document-templates'

// Billing Tenant Config
export {
  useBillingTenantConfig,
  useUpsertBillingTenantConfig,
} from './use-billing-tenant-config'

// Billing Service Cases
export {
  useBillingServiceCases,
  useBillingServiceCase,
  useCreateBillingServiceCase,
  useUpdateBillingServiceCase,
  useCloseBillingServiceCase,
  useCreateInvoiceFromServiceCase,
  useCreateOrderFromServiceCase,
  useDeleteBillingServiceCase,
} from './use-billing-service-cases'

// Billing Payments (Open Items)
export {
  useBillingOpenItems,
  useBillingOpenItem,
  useBillingOpenItemsSummary,
  useBillingPayments,
  useCreateBillingPayment,
  useCancelBillingPayment,
} from './use-billing-payments'

// Inbound Invoice Payments
export {
  useInboundInvoicePayments,
  useCreateInboundInvoicePayment,
  useCancelInboundInvoicePayment,
} from './use-inbound-invoice-payments'

// Billing Price Lists
export {
  useBillingPriceLists,
  useBillingPriceList,
  useBillingPriceLookup,
  usePriceListEntriesForAddress,
  useCreateBillingPriceList,
  useUpdateBillingPriceList,
  useDeleteBillingPriceList,
  useSetDefaultBillingPriceList,
  useBillingPriceListEntries,
  useCreateBillingPriceListEntry,
  useUpdateBillingPriceListEntry,
  useDeleteBillingPriceListEntry,
  useBulkImportBillingPriceListEntries,
} from './use-billing-price-lists'

// Billing Recurring Invoices
export {
  useBillingRecurringInvoices,
  useBillingRecurringInvoice,
  useBillingRecurringInvoicePreview,
  useCreateBillingRecurringInvoice,
  useUpdateBillingRecurringInvoice,
  useDeleteBillingRecurringInvoice,
  useActivateBillingRecurringInvoice,
  useDeactivateBillingRecurringInvoice,
  useGenerateRecurringInvoice,
  useGenerateDueRecurringInvoices,
} from './use-billing-recurring'

// Dunning (Mahnwesen)
export {
  useDunningProposal,
  useDunningSettings,
  useUpdateDunningSettings,
  useDunningTemplates,
  useDunningTemplate,
  useCreateDunningTemplate,
  useUpdateDunningTemplate,
  useDeleteDunningTemplate,
  useSeedDefaultDunningTemplates,
  useCreateDunningRun,
  useDunningRuns,
  useDunningRun,
  useSendDunningReminder,
  useMarkDunningReminderSent,
  useCancelDunningReminder,
  useDunningPdfDownloadUrl,
  useDunningPdfPreview,
  useSetCustomerDunningBlock,
  useSetInvoiceDunningBlock,
} from './use-dunning'

// Warehouse Articles
export {
  useWhArticles,
  useWhArticle,
  useWhArticleSearch,
  useWhArticleGroups,
  useCreateWhArticle,
  useUpdateWhArticle,
  useDeleteWhArticle,
  useRestoreWhArticle,
  useHardDeleteWhArticle,
  useAdjustWhArticleStock,
  useCreateWhArticleGroup,
  useUpdateWhArticleGroup,
  useDeleteWhArticleGroup,
  useWhArticleSuppliers,
  useAddWhArticleSupplier,
  useUpdateWhArticleSupplier,
  useRemoveWhArticleSupplier,
  useWhArticleBom,
  useAddWhArticleBom,
  useUpdateWhArticleBom,
  useRemoveWhArticleBom,
} from './use-wh-articles'

// Warehouse Article Images
export {
  useWhArticleImages,
  useUploadWhArticleImage,
  useSetPrimaryWhArticleImage,
  useReorderWhArticleImages,
  useDeleteWhArticleImage,
} from './use-wh-article-images'

// Warehouse Article Prices
export {
  useWhPriceLists,
  useCreateWhPriceList,
  useUpdateWhPriceList,
  useDeleteWhPriceList,
  useWhArticlePrices,
  useWhPriceListArticles,
  useSetWhArticlePrice,
  useRemoveWhArticlePrice,
  useBulkSetWhArticlePrices,
  useCopyWhPriceList,
  useAdjustWhPrices,
} from './use-wh-article-prices'

// Warehouse Purchase Orders
export {
  useWhPurchaseOrders,
  useWhPurchaseOrder,
  useWhReorderSuggestions,
  useCreateWhPurchaseOrder,
  useUpdateWhPurchaseOrder,
  useDeleteWhPurchaseOrder,
  useSendWhPurchaseOrder,
  useCancelWhPurchaseOrder,
  useCreateWhPOFromSuggestions,
  useWhPOPositions,
  useAddWhPOPosition,
  useUpdateWhPOPosition,
  useDeleteWhPOPosition,
  useGenerateWhPurchaseOrderPdf,
  useDownloadWhPurchaseOrderPdf,
} from './use-wh-purchase-orders'

// Warehouse Stock Movements
export {
  useWhPendingOrders,
  useWhOrderPositions,
  useWhStockMovements,
  useWhArticleMovements,
  useBookGoodsReceipt,
  useBookSinglePosition,
} from './use-wh-stock-movements'

// Warehouse Withdrawals
export {
  useWhWithdrawals,
  useWhWithdrawalsByOrder,
  useWhWithdrawalsByDocument,
  useCreateWhWithdrawal,
  useCreateBatchWhWithdrawal,
  useCancelWhWithdrawal,
} from './use-wh-withdrawals'

// Delivery Note Stock Bookings
export {
  usePreviewStockBookings,
  useConfirmStockBookings,
} from './use-delivery-note-stock'

// Warehouse Corrections
export {
  useWhCorrectionMessages,
  useWhCorrectionMessageById,
  useWhCorrectionSummary,
  useWhCorrectionRuns,
  useResolveWhCorrection,
  useDismissWhCorrection,
  useResolveBulkWhCorrection,
  useTriggerWhCorrectionRun,
} from './use-wh-corrections'

// Warehouse Reservations
export {
  useWhReservations,
  useWhArticleAvailableStock,
  useReleaseWhReservation,
  useReleaseWhReservationsBulk,
} from './use-wh-reservations'

// Warehouse QR Scanner
export {
  useResolveQrCode,
  useResolveByNumber,
  useGenerateLabelPdf,
  useGenerateAllLabelsPdf,
  useGenerateSingleQr,
  useQrRecentMovements,
  useQrPendingPositions,
} from './use-wh-qr'

// Warehouse Stocktake
export {
  useWhStocktakes,
  useWhStocktake,
  useWhStocktakePositions,
  useWhStocktakePositionByArticle,
  useWhStocktakeStats,
  useCreateWhStocktake,
  useStartStocktakeCounting,
  useRecordStocktakeCount,
  useReviewStocktakePosition,
  useSkipStocktakePosition,
  useCompleteStocktake,
  useCancelStocktake,
  useDeleteStocktake,
  useGenerateStocktakePdf,
} from './use-wh-stocktake'

// HR Personnel File
export {
  useHrPersonnelFileCategories,
  useCreateHrPersonnelFileCategory,
  useUpdateHrPersonnelFileCategory,
  useDeleteHrPersonnelFileCategory,
  useHrPersonnelFileEntries,
  useHrPersonnelFileEntry,
  useCreateHrPersonnelFileEntry,
  useUpdateHrPersonnelFileEntry,
  useDeleteHrPersonnelFileEntry,
  useHrPersonnelFileReminders,
  useHrPersonnelFileExpiring,
  useUploadHrPersonnelFileAttachment,
  useDeleteHrPersonnelFileAttachment,
  useHrPersonnelFileDownloadUrl,
} from './use-hr-personnel-file'

// DSGVO Retention
export {
  useDsgvoRules,
  useUpdateDsgvoRule,
  useDsgvoPreview,
  useExecuteDsgvoRetention,
  useDsgvoLogs,
} from './use-dsgvo'

// AI Assistant
export { useAiAssistantStream } from './use-ai-assistant'

// Employee Payroll: Children
export {
  useEmployeeChildren,
  useCreateEmployeeChild,
  useUpdateEmployeeChild,
  useDeleteEmployeeChild,
} from './use-employee-children'

// Employee Payroll: Company Cars
export {
  useEmployeeCompanyCars,
  useCreateEmployeeCompanyCar,
  useUpdateEmployeeCompanyCar,
  useDeleteEmployeeCompanyCar,
} from './use-employee-company-cars'

// Employee Payroll: Job Bikes
export {
  useEmployeeJobBikes,
  useCreateEmployeeJobBike,
  useUpdateEmployeeJobBike,
  useDeleteEmployeeJobBike,
} from './use-employee-job-bikes'

// Employee Payroll: Meal Allowances
export {
  useEmployeeMealAllowances,
  useCreateEmployeeMealAllowance,
  useUpdateEmployeeMealAllowance,
  useDeleteEmployeeMealAllowance,
} from './use-employee-meal-allowances'

// Employee Payroll: Vouchers
export {
  useEmployeeVouchers,
  useCreateEmployeeVoucher,
  useUpdateEmployeeVoucher,
  useDeleteEmployeeVoucher,
} from './use-employee-vouchers'

// Employee Payroll: Job Tickets
export {
  useEmployeeJobTickets,
  useCreateEmployeeJobTicket,
  useUpdateEmployeeJobTicket,
  useDeleteEmployeeJobTicket,
} from './use-employee-job-tickets'

// Employee Payroll: Pensions
export {
  useEmployeePensions,
  useCreateEmployeePension,
  useUpdateEmployeePension,
  useDeleteEmployeePension,
} from './use-employee-pensions'

// Employee Payroll: Savings
export {
  useEmployeeSavings,
  useCreateEmployeeSaving,
  useUpdateEmployeeSaving,
  useDeleteEmployeeSaving,
} from './use-employee-savings'

// Employee Payroll: Garnishments
export {
  useEmployeeGarnishments,
  useCreateEmployeeGarnishment,
  useUpdateEmployeeGarnishment,
  useDeleteEmployeeGarnishment,
} from './use-employee-garnishments'

// Employee Payroll: Parental Leaves
export {
  useEmployeeParentalLeaves,
  useCreateEmployeeParentalLeave,
  useUpdateEmployeeParentalLeave,
  useDeleteEmployeeParentalLeave,
} from './use-employee-parental-leaves'

// Employee Payroll: Maternity Leaves
export {
  useEmployeeMaternityLeaves,
  useCreateEmployeeMaternityLeave,
  useUpdateEmployeeMaternityLeave,
  useDeleteEmployeeMaternityLeave,
} from './use-employee-maternity-leaves'

// Employee Payroll: Foreign Assignments
export {
  useEmployeeForeignAssignments,
  useCreateEmployeeForeignAssignment,
  useUpdateEmployeeForeignAssignment,
  useDeleteEmployeeForeignAssignment,
} from './use-employee-foreign-assignments'

// Employee Payroll: Other Employments
export {
  useEmployeeOtherEmployments,
  useCreateEmployeeOtherEmployment,
  useUpdateEmployeeOtherEmployment,
  useDeleteEmployeeOtherEmployment,
} from './use-employee-other-employments'

// Employee Payroll: Lookups
export { useHealthInsuranceProviders } from './use-health-insurance-providers'
export { useActivityCodesKldb } from './use-activity-codes-kldb'

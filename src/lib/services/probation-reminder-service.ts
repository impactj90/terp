import { Prisma } from "@/generated/prisma/client"
import type { PrismaClient } from "@/generated/prisma/client"
import {
  type DataScope,
  type DataScopeType,
} from "@/lib/auth/middleware"
import { isEmployeeWithinDataScope } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { hasAnyPermission } from "@/lib/auth/permissions"
import type { ContextUser } from "@/trpc/init"
import {
  DEFAULT_PROBATION_MONTHS,
  DEFAULT_PROBATION_REMINDER_DAYS,
  normalizeProbationReminderDays,
} from "./probation-service"
import * as probationRepo from "./probation-repository"

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const NOTIFICATION_TYPE = "reminders"

type ReminderRecipientRow = ContextUser & {
  notificationPreferences: Array<{ remindersEnabled: boolean }>
}

export type TenantProbationReminderResult = {
  skipped: boolean
  skipReason?: "disabled" | "no_due_employees" | "no_recipients"
  employeesDue: number
  remindersCreated: number
  duplicateCount: number
  notificationsCreated: number
  recipientsNotified: number
  recipientsSuppressedByPreference: number
  recipientsSuppressedByScope: number
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ))
}

function formatGermanDate(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

function buildDataScopeForUser(user: {
  dataScopeType: string
  dataScopeTenantIds: string[]
  dataScopeDepartmentIds: string[]
  dataScopeEmployeeIds: string[]
}): DataScope {
  return {
    type: (user.dataScopeType as DataScopeType) || "all",
    tenantIds: user.dataScopeTenantIds ?? [],
    departmentIds: user.dataScopeDepartmentIds ?? [],
    employeeIds: user.dataScopeEmployeeIds ?? [],
  }
}

function buildReminderTitle(daysRemaining: number): string {
  if (daysRemaining === 1) {
    return "Probezeit endet morgen"
  }

  return `Probezeit endet in ${daysRemaining} Tagen`
}

function buildReminderMessage(candidate: {
  firstName: string
  lastName: string
  departmentName: string | null
  probationEndDate: Date
}): string {
  const baseName = `${candidate.firstName} ${candidate.lastName}`
  const employeeLabel = candidate.departmentName
    ? `${baseName} (${candidate.departmentName})`
    : baseName

  return `${employeeLabel}: Probezeit endet am ${formatGermanDate(candidate.probationEndDate)}.`
}

async function loadTenantSettings(
  prisma: PrismaClient,
  tenantId: string
): Promise<{
  probationDefaultMonths: number
  probationRemindersEnabled: boolean
  probationReminderDays: number[]
}> {
  const settings = await prisma.systemSetting?.findUnique?.({
    where: { tenantId },
    select: {
      probationDefaultMonths: true,
      probationRemindersEnabled: true,
      probationReminderDays: true,
    },
  })

  return {
    probationDefaultMonths:
      settings?.probationDefaultMonths ?? DEFAULT_PROBATION_MONTHS,
    probationRemindersEnabled:
      settings?.probationRemindersEnabled ?? true,
    probationReminderDays: normalizeProbationReminderDays(
      settings?.probationReminderDays ?? [...DEFAULT_PROBATION_REMINDER_DAYS]
    ),
  }
}

async function findReminderRecipients(
  prisma: PrismaClient,
  tenantId: string
): Promise<{
  recipients: ReminderRecipientRow[]
  recipientsSuppressedByPreference: number
}> {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      isLocked: false,
      userTenants: {
        some: { tenantId },
      },
    },
    include: {
      userGroup: true,
      userTenants: {
        include: { tenant: true },
      },
      notificationPreferences: {
        where: { tenantId },
        select: { remindersEnabled: true },
        take: 1,
      },
    },
  })

  const employeeViewUsers = users.filter((user) =>
    hasAnyPermission(user as unknown as ContextUser, [EMPLOYEES_VIEW])
  ) as ReminderRecipientRow[]

  const recipients = employeeViewUsers.filter(
    (user) => user.notificationPreferences[0]?.remindersEnabled ?? true
  )

  return {
    recipients,
    recipientsSuppressedByPreference:
      employeeViewUsers.length - recipients.length,
  }
}

async function publishUnreadCountUpdate(
  prisma: PrismaClient,
  tenantId: string,
  userId: string
): Promise<void> {
  try {
    const { getHub } = await import("@/lib/pubsub/singleton")
    const { userTopic } = await import("@/lib/pubsub/topics")
    const hub = await getHub()
    const unreadCount = await prisma.notification.count({
      where: { tenantId, userId, readAt: null },
    })

    await hub.publish(
      userTopic(userId),
      {
        event: "notification",
        type: NOTIFICATION_TYPE,
        unread_count: unreadCount,
      },
      true
    )
  } catch {
    // best effort
  }
}

export async function processTenantProbationReminders(
  prisma: PrismaClient,
  tenantId: string,
  now: Date = new Date()
): Promise<TenantProbationReminderResult> {
  const today = startOfUtcDay(now)
  const settings = await loadTenantSettings(prisma, tenantId)

  if (!settings.probationRemindersEnabled) {
    return {
      skipped: true,
      skipReason: "disabled",
      employeesDue: 0,
      remindersCreated: 0,
      duplicateCount: 0,
      notificationsCreated: 0,
      recipientsNotified: 0,
      recipientsSuppressedByPreference: 0,
      recipientsSuppressedByScope: 0,
    }
  }

  const candidates = await probationRepo.findDueProbationReminderCandidates(
    prisma,
    {
      tenantId,
      tenantProbationDefaultMonths: settings.probationDefaultMonths,
      dataScope: {
        type: "all",
        tenantIds: [],
        departmentIds: [],
        employeeIds: [],
      },
      today,
      reminderDays: settings.probationReminderDays,
    }
  )

  if (candidates.length === 0) {
    return {
      skipped: true,
      skipReason: "no_due_employees",
      employeesDue: 0,
      remindersCreated: 0,
      duplicateCount: 0,
      notificationsCreated: 0,
      recipientsNotified: 0,
      recipientsSuppressedByPreference: 0,
      recipientsSuppressedByScope: 0,
    }
  }

  const {
    recipients,
    recipientsSuppressedByPreference,
  } = await findReminderRecipients(prisma, tenantId)

  if (recipients.length === 0) {
    return {
      skipped: true,
      skipReason: "no_recipients",
      employeesDue: candidates.length,
      remindersCreated: 0,
      duplicateCount: 0,
      notificationsCreated: 0,
      recipientsNotified: 0,
      recipientsSuppressedByPreference,
      recipientsSuppressedByScope: 0,
    }
  }

  let remindersCreated = 0
  let duplicateCount = 0
  let notificationsCreated = 0
  let recipientsSuppressedByScope = 0
  const notifiedUsers = new Set<string>()

  for (const candidate of candidates) {
    const probationEndDate = new Date(candidate.probationEndDate)

    try {
      await prisma.employeeProbationReminder.create({
        data: {
          tenantId,
          employeeId: candidate.id,
          reminderDaysBefore: candidate.daysRemaining,
          probationEndDate,
        },
      })
      remindersCreated++
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        duplicateCount++
        continue
      }

      throw error
    }

    const visibleRecipients = recipients.filter((recipient) =>
      isEmployeeWithinDataScope(buildDataScopeForUser(recipient), {
        id: candidate.id,
        departmentId: candidate.departmentId,
      })
    )

    recipientsSuppressedByScope += recipients.length - visibleRecipients.length

    for (const recipient of visibleRecipients) {
      try {
        await prisma.notification.create({
          data: {
            tenantId,
            userId: recipient.id,
            type: NOTIFICATION_TYPE,
            title: buildReminderTitle(candidate.daysRemaining),
            message: buildReminderMessage({
              firstName: candidate.firstName,
              lastName: candidate.lastName,
              departmentName: candidate.departmentName,
              probationEndDate,
            }),
            link: `/admin/employees/${candidate.id}`,
          },
        })
        notificationsCreated++
        notifiedUsers.add(recipient.id)
      } catch (error) {
        console.error(
          `[probation-reminders] notification create failed for tenant ${tenantId}, user ${recipient.id}, employee ${candidate.id}:`,
          error
        )
      }
    }
  }

  await Promise.all(
    Array.from(notifiedUsers).map((userId) =>
      publishUnreadCountUpdate(prisma, tenantId, userId)
    )
  )

  return {
    skipped: false,
    employeesDue: candidates.length,
    remindersCreated,
    duplicateCount,
    notificationsCreated,
    recipientsNotified: notifiedUsers.size,
    recipientsSuppressedByPreference,
    recipientsSuppressedByScope,
  }
}

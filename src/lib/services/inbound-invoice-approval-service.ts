import type { PrismaClient } from "@/generated/prisma/client"
import * as policyRepo from "./inbound-invoice-approval-policy-repository"
import * as approvalRepo from "./inbound-invoice-approval-repository"
import * as invoiceRepo from "./inbound-invoice-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Constants ---

const DEFAULT_ESCALATION_HOURS = 24

// --- PubSub Helper (best-effort, same pattern as absences-service) ---

async function publishUnreadCountUpdate(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  type?: string
) {
  try {
    const { getHub } = await import("@/lib/pubsub/singleton")
    const { userTopic } = await import("@/lib/pubsub/topics")
    const hub = await getHub()
    const unreadCount = await prisma.notification.count({
      where: { tenantId, userId, readAt: null },
    })
    await hub.publish(
      userTopic(userId),
      { event: "notification", type: type ?? "general", unread_count: unreadCount },
      true
    )
  } catch {
    // best effort — never block the main flow
  }
}

async function notifyUser(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  notification: { type: string; title: string; message: string; link?: string }
) {
  try {
    await prisma.notification.create({
      data: {
        tenantId,
        userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        link: notification.link ?? null,
      },
    })
    await publishUnreadCountUpdate(prisma, tenantId, userId, notification.type)
  } catch (err) {
    console.error("[Notification] Failed:", err)
  }
}

// --- Error Classes ---

export class ApprovalNotFoundError extends Error {
  constructor(message = "Approval step not found") {
    super(message)
    this.name = "ApprovalNotFoundError"
  }
}

export class ApprovalValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ApprovalValidationError"
  }
}

export class ApprovalForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ApprovalForbiddenError"
  }
}

// --- Service Functions ---

/**
 * Create approval steps for an invoice based on tenant policies.
 * If no policies match, auto-approves the invoice.
 */
export async function createApprovalSteps(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  grossAmount: number,
  approvalVersion: number
) {
  const policies = await policyRepo.findForAmount(prisma, tenantId, grossAmount)

  if (policies.length === 0) {
    // No policies → auto-approve
    await invoiceRepo.updateStatus(prisma, tenantId, invoiceId, "APPROVED")
    return
  }

  const dueAt = new Date(Date.now() + DEFAULT_ESCALATION_HOURS * 60 * 60 * 1000)

  await approvalRepo.createMany(
    prisma,
    invoiceId,
    tenantId,
    policies.map((policy) => ({
      stepOrder: policy.stepOrder,
      approvalVersion,
      approverGroupId: policy.approverGroupId,
      approverUserId: policy.approverUserId,
      dueAt,
    }))
  )

  await invoiceRepo.updateStatus(prisma, tenantId, invoiceId, "PENDING_APPROVAL")

  // Notify first-step approver(s)
  const invoice = await invoiceRepo.findById(prisma, tenantId, invoiceId)
  const firstStep = policies[0]
  if (firstStep && invoice) {
    const approverIds = await resolveApproverUserIds(prisma, firstStep.approverUserId, firstStep.approverGroupId)
    for (const uid of approverIds) {
      await notifyUser(prisma, tenantId, uid, {
        type: "approvals",
        title: "Neue Rechnung zur Freigabe",
        message: `Rechnung ${invoice.number} (${grossAmount.toFixed(2)} €) wartet auf Ihre Freigabe`,
        link: `/invoices/inbound/${invoiceId}`,
      })
    }
  }
}

/**
 * Resolve user IDs for an approver (direct user or group members).
 */
async function resolveApproverUserIds(
  prisma: PrismaClient,
  approverUserId: string | null,
  approverGroupId: string | null
): Promise<string[]> {
  if (approverUserId) return [approverUserId]
  if (approverGroupId) {
    const members = await prisma.user.findMany({
      where: { userGroupId: approverGroupId, isActive: true },
      select: { id: true },
    })
    return members.map((m) => m.id)
  }
  return []
}

/**
 * Approve an approval step. If all steps are approved, sets invoice to APPROVED.
 */
export async function approve(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  approvalId: string,
  userId: string,
  audit?: AuditContext
) {
  const invoice = await invoiceRepo.findById(prisma, tenantId, invoiceId)
  if (!invoice) throw new ApprovalNotFoundError("Invoice not found")

  const approval = await prisma.inboundInvoiceApproval.findFirst({
    where: { id: approvalId, invoiceId },
  })
  if (!approval) throw new ApprovalNotFoundError("Approval step not found")

  // Guards
  if (approval.status !== "PENDING") {
    throw new ApprovalValidationError(`Approval step is already ${approval.status}`)
  }
  if (approval.approvalVersion !== invoice.approvalVersion) {
    throw new ApprovalValidationError("Approval version mismatch — invoice was modified")
  }
  if (invoice.submittedBy === userId) {
    throw new ApprovalForbiddenError("Submitter cannot approve their own invoice")
  }

  const authorized = await isUserAuthorized(prisma, approval, userId)
  if (!authorized) {
    throw new ApprovalForbiddenError("You are not authorized to approve this step")
  }

  // Record decision
  await approvalRepo.updateDecision(prisma, approvalId, {
    status: "APPROVED",
    decidedBy: userId,
  })

  // Check if all steps for this version are approved
  const remainingSteps = await approvalRepo.findByInvoiceId(
    prisma, invoiceId, invoice.approvalVersion
  )
  const allApproved = remainingSteps.every(
    (s) => s.id === approvalId || s.status === "APPROVED"
  )

  if (allApproved) {
    await invoiceRepo.updateStatus(prisma, tenantId, invoiceId, "APPROVED")
    // Notify submitter: invoice approved
    if (invoice.submittedBy) {
      await notifyUser(prisma, tenantId, invoice.submittedBy, {
        type: "approvals",
        title: "Rechnung freigegeben",
        message: `Rechnung ${invoice.number} wurde freigegeben`,
        link: `/invoices/inbound/${invoiceId}`,
      })
    }
  } else {
    // Notify next-step approver
    const nextStep = remainingSteps.find(
      (s) => s.id !== approvalId && s.status === "PENDING"
    )
    if (nextStep) {
      const nextIds = await resolveApproverUserIds(prisma, nextStep.approverUserId, nextStep.approverGroupId)
      for (const uid of nextIds) {
        await notifyUser(prisma, tenantId, uid, {
          type: "approvals",
          title: "Rechnung zur Freigabe",
          message: `Rechnung ${invoice.number} wartet auf Ihre Freigabe (Schritt ${nextStep.stepOrder})`,
          link: `/invoices/inbound/${invoiceId}`,
        })
      }
    }
  }

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "approve",
        entityType: "inbound_invoice",
        entityId: invoiceId,
        entityName: invoice.number,
        changes: {
          approvalStep: { old: "PENDING", new: "APPROVED" },
          stepOrder: { old: null, new: approval.stepOrder },
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return invoiceRepo.findById(prisma, tenantId, invoiceId)
}

/**
 * Reject an approval step. Sets invoice to REJECTED.
 */
export async function reject(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  approvalId: string,
  userId: string,
  reason: string,
  audit?: AuditContext
) {
  const invoice = await invoiceRepo.findById(prisma, tenantId, invoiceId)
  if (!invoice) throw new ApprovalNotFoundError("Invoice not found")

  const approval = await prisma.inboundInvoiceApproval.findFirst({
    where: { id: approvalId, invoiceId },
  })
  if (!approval) throw new ApprovalNotFoundError("Approval step not found")

  // Guards
  if (approval.status !== "PENDING") {
    throw new ApprovalValidationError(`Approval step is already ${approval.status}`)
  }
  if (approval.approvalVersion !== invoice.approvalVersion) {
    throw new ApprovalValidationError("Approval version mismatch — invoice was modified")
  }
  if (invoice.submittedBy === userId) {
    throw new ApprovalForbiddenError("Submitter cannot reject their own invoice")
  }

  const authorized = await isUserAuthorized(prisma, approval, userId)
  if (!authorized) {
    throw new ApprovalForbiddenError("You are not authorized to reject this step")
  }

  // Record decision
  await approvalRepo.updateDecision(prisma, approvalId, {
    status: "REJECTED",
    decidedBy: userId,
    rejectionReason: reason,
  })

  // Set invoice to REJECTED
  await invoiceRepo.updateStatus(prisma, tenantId, invoiceId, "REJECTED")

  // Notify submitter about rejection
  if (invoice.submittedBy) {
    await notifyUser(prisma, tenantId, invoice.submittedBy, {
      type: "approvals",
      title: "Rechnung abgelehnt",
      message: `Rechnung ${invoice.number} wurde abgelehnt: ${reason}`,
      link: `/invoices/inbound/${invoiceId}`,
    })
  }

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "reject",
        entityType: "inbound_invoice",
        entityId: invoiceId,
        entityName: invoice.number,
        changes: {
          approvalStep: { old: "PENDING", new: "REJECTED" },
          rejectionReason: { old: null, new: reason },
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return invoiceRepo.findById(prisma, tenantId, invoiceId)
}

/**
 * Handle material change on an invoice: invalidate old approvals, reset to DRAFT.
 */
export async function handleMaterialChange(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  newVersion: number
) {
  const invalidated = await approvalRepo.invalidateByVersion(prisma, invoiceId, newVersion)

  if (invalidated > 0) {
    // Check if invoice was PENDING_APPROVAL → reset to DRAFT
    const invoice = await invoiceRepo.findById(prisma, tenantId, invoiceId)
    if (invoice && invoice.status === "PENDING_APPROVAL") {
      await invoiceRepo.updateStatus(prisma, tenantId, invoiceId, "DRAFT")
    }
  }
}

/**
 * Check if a user is authorized for an approval step.
 * Direct user match or group membership.
 */
export async function isUserAuthorized(
  prisma: PrismaClient,
  approval: { approverUserId: string | null; approverGroupId: string | null },
  userId: string
): Promise<boolean> {
  // Direct user match
  if (approval.approverUserId && approval.approverUserId === userId) {
    return true
  }

  // Group membership match
  if (approval.approverGroupId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { userGroupId: true },
    })
    if (user?.userGroupId === approval.approverGroupId) {
      return true
    }
  }

  return false
}

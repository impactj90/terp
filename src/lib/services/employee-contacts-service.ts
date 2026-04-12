/**
 * Employee Contacts Service
 *
 * Business logic for employee contact operations.
 * Delegates data access to the repository layer.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./employee-contacts-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found")
    this.name = "EmployeeNotFoundError"
  }
}

export class ContactNotFoundError extends Error {
  constructor() {
    super("Contact not found")
    this.name = "ContactNotFoundError"
  }
}

export class ContactValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContactValidationError"
  }
}

// --- Helpers ---

function mapContactToOutput(c: {
  id: string
  employeeId: string
  contactType: string
  value: string
  label: string | null
  isPrimary: boolean
  contactKindId: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: c.id,
    employeeId: c.employeeId,
    contactType: c.contactType,
    value: c.value,
    label: c.label,
    isPrimary: c.isPrimary,
    contactKindId: c.contactKindId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

// --- Service Functions ---

/**
 * Lists contacts for an employee.
 * Verifies employee belongs to tenant.
 */
export async function listContacts(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  const employee = await repo.findEmployeeForTenant(prisma, tenantId, employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  const contacts = await repo.listContactsByEmployee(prisma, employeeId)
  return { data: contacts.map(mapContactToOutput) }
}

/**
 * Creates a new contact for an employee.
 * Validates contactType and value are non-empty after trimming.
 * Verifies employee belongs to tenant.
 */
export async function createContact(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    contactType: string
    value: string
    label?: string
    isPrimary?: boolean
    contactKindId?: string
  },
  audit?: AuditContext
) {
  const employee = await repo.findEmployeeForTenant(prisma, tenantId, input.employeeId)
  if (!employee) {
    throw new EmployeeNotFoundError()
  }

  const contactType = input.contactType.trim()
  if (contactType.length === 0) {
    throw new ContactValidationError("Contact type is required")
  }

  const value = input.value.trim()
  if (value.length === 0) {
    throw new ContactValidationError("Contact value is required")
  }

  const contact = await repo.createContact(prisma, {
    employeeId: input.employeeId,
    contactType,
    value,
    label: input.label?.trim() || null,
    isPrimary: input.isPrimary ?? false,
    contactKindId: input.contactKindId ?? null,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "employee_contact",
      entityId: contact.id,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return mapContactToOutput(contact)
}

/**
 * Deletes a contact.
 * Fetches the contact with its employee relation to verify
 * the employee belongs to the current tenant.
 */
export async function deleteContact(
  prisma: PrismaClient,
  tenantId: string,
  contactId: string,
  audit?: AuditContext
) {
  const contact = await repo.findContactWithEmployee(prisma, tenantId, contactId)
  if (!contact) {
    throw new ContactNotFoundError()
  }

  if (contact.employee.tenantId !== tenantId) {
    throw new ContactNotFoundError()
  }

  await repo.deleteContact(prisma, tenantId, contactId)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "employee_contact",
      entityId: contactId,
      entityName: null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return { success: true }
}

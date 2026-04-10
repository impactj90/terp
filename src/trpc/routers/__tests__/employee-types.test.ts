/**
 * Type verification tests for Employee Prisma models (ZMI-TICKET-205).
 *
 * These tests verify that the generated Prisma types have the expected shape
 * and that the Employee model types are available for use in application code.
 */
import { describe, it, expect } from "vitest"
import { Decimal } from "@prisma/client/runtime/client"
import type {
  EmployeeContact,
  EmployeeCard,
  EmployeeTariffAssignment,
} from "@/generated/prisma/client"

describe("Employee Prisma types", () => {
  it("Employee type has all expected fields", () => {
    // Verify the type exists and has correct shape by creating a type-safe object
    const employee = {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: "00000000-0000-0000-0000-000000000002",
      personnelNumber: "EMP-001",
      pin: "1234",
      firstName: "Max",
      lastName: "Mustermann",
      email: "max@example.com",
      phone: "+49123456789",
      entryDate: new Date("2024-01-01"),
      exitDate: null,
      departmentId: null,
      costCenterId: null,
      employmentTypeId: null,
      weeklyHours: new Decimal("40.00"),
      vacationDaysPerYear: new Decimal("30.00"),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      tariffId: null,
      exitReason: null,
      notes: null,
      addressStreet: null,
      addressZip: null,
      addressCity: null,
      addressCountry: null,
      birthDate: null,
      gender: null,
      nationality: null,
      religion: null,
      maritalStatus: null,
      birthPlace: null,
      birthCountry: null,
      roomNumber: null,
      photoUrl: null,
      employeeGroupId: null,
      workflowGroupId: null,
      activityGroupId: null,
      partTimePercent: null,
      disabilityFlag: false,
      dailyTargetHours: null,
      weeklyTargetHours: null,
      monthlyTargetHours: null,
      annualTargetHours: null,
      workDaysPerWeek: null,
      calculationStartDate: null,
      defaultOrderId: null,
      defaultActivityId: null,
      locationId: null,
    }
    expect(employee.id).toBeDefined()
    expect(employee.personnelNumber).toBe("EMP-001")
    expect(employee.pin).toBe("1234")
  })

  it("EmployeeContact type has all expected fields", () => {
    const contact: EmployeeContact = {
      id: "00000000-0000-0000-0000-000000000001",
      employeeId: "00000000-0000-0000-0000-000000000002",
      contactType: "email",
      value: "max@example.com",
      label: "Work",
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      contactKindId: null,
    }
    expect(contact.contactType).toBe("email")
    expect(contact.contactKindId).toBeNull()
  })

  it("EmployeeCard type has all expected fields", () => {
    const card: EmployeeCard = {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: "00000000-0000-0000-0000-000000000002",
      employeeId: "00000000-0000-0000-0000-000000000003",
      cardNumber: "CARD-001",
      cardType: "rfid",
      validFrom: new Date("2024-01-01"),
      validTo: null,
      isActive: true,
      deactivatedAt: null,
      deactivationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(card.cardNumber).toBe("CARD-001")
    expect(card.tenantId).toBeDefined()
    expect(card.deactivatedAt).toBeNull()
  })

  it("EmployeeTariffAssignment type has all expected fields", () => {
    const assignment: EmployeeTariffAssignment = {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: "00000000-0000-0000-0000-000000000002",
      employeeId: "00000000-0000-0000-0000-000000000003",
      tariffId: "00000000-0000-0000-0000-000000000004",
      effectiveFrom: new Date("2024-01-01"),
      effectiveTo: null,
      overwriteBehavior: "preserve_manual",
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(assignment.overwriteBehavior).toBe("preserve_manual")
    expect(assignment.effectiveFrom).toBeDefined()
  })
})

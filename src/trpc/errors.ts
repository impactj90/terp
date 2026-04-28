import { TRPCError } from "@trpc/server"
import { Prisma } from "@/generated/prisma/client"

/**
 * Maps domain service errors to tRPC error responses.
 *
 * Services throw plain Error subclasses (e.g., EmployeeNotFoundError).
 * This helper converts them to the correct tRPC error codes.
 */
export function handleServiceError(err: unknown): never {
  if (err instanceof TRPCError) {
    throw err
  }

  if (err instanceof Error) {
    // Use err.name (set explicitly via `this.name = "FooError"` in
    // each service-error constructor) rather than err.constructor.name.
    // Production minification mangles class names, so constructor.name
    // becomes single-letter junk and every custom error falls through
    // to the generic INTERNAL_SERVER_ERROR branch.
    const name = err.name

    // NotFound errors
    if (name.endsWith("NotFoundError")) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: err.message,
        cause: err,
      })
    }

    // Validation errors
    if (name.endsWith("ValidationError") || name.endsWith("InvalidError")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err.message,
        cause: err,
      })
    }

    // Conflict errors (e.g., duplicate)
    if (name.endsWith("ConflictError") || name.endsWith("DuplicateError")) {
      throw new TRPCError({
        code: "CONFLICT",
        message: err.message,
        cause: err,
      })
    }

    // Precondition errors — used when the operation is rejected because
    // the entity is in the wrong state or a required prerequisite is
    // missing (e.g., "WorkReport must be SIGNED to generate an invoice",
    // "no customer address on Service Object"). Distinct from validation
    // (BAD_REQUEST) because the input itself is fine; from conflict
    // (CONFLICT) because there's no concurrent-update race; and from
    // forbidden (FORBIDDEN) because there's no permission gap.
    if (name.endsWith("PreconditionFailedError")) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: err.message,
        cause: err,
      })
    }

    // Permission / access errors
    if (name.endsWith("ForbiddenError") || name.endsWith("AccessDeniedError")) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: err.message,
        cause: err,
      })
    }
  }

  // Prisma-specific error handling — prevent raw DB messages from leaking to clients
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2025":
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Record not found",
          cause: err,
        })
      case "P2002":
        throw new TRPCError({
          code: "CONFLICT",
          message: "A record with this value already exists",
          cause: err,
        })
      case "P2003":
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Referenced record does not exist",
          cause: err,
        })
      default:
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
          cause: err,
        })
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid query parameters",
      cause: err,
    })
  }

  // Fallback: wrap unknown errors as INTERNAL_SERVER_ERROR
  console.error("[handleServiceError] Unhandled error:", err)
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
    cause: err instanceof Error ? err : undefined,
  })
}

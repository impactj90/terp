/**
 * AI Assistant Router
 *
 * Provides the askQuestion mutation for the in-app AI assistant.
 * Available to all authenticated tenant users (no permission guard).
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { TRPCError } from "@trpc/server"
import * as aiAssistantService from "@/lib/services/ai-assistant-service"

// --- Input / Output Schemas ---

const askQuestionInput = z.object({
  question: z.string().min(1).max(500),
  mode: z.enum(["kompakt", "ausfuehrlich"]).default("kompakt"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(20)
    .default([]),
})

const askQuestionOutput = z.object({
  answer: z.string(),
})

// --- Router ---

export const aiAssistantRouter = createTRPCRouter({
  /**
   * aiAssistant.askQuestion — sends a question to the AI assistant.
   * Returns the assistant's answer based on the Terp handbook.
   */
  askQuestion: tenantProcedure
    .input(askQuestionInput)
    .output(askQuestionOutput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await aiAssistantService.askQuestion(
          ctx.prisma,
          {
            tenantId: ctx.tenantId!,
            userId: ctx.user!.id,
            question: input.question,
            mode: input.mode,
            history: input.history,
          },
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        // Custom handling for rate limit error (not in standard handleServiceError map)
        if (
          err instanceof Error &&
          err.name === "AiAssistantRateLimitError"
        ) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: err.message,
          })
        }
        handleServiceError(err)
      }
    }),
})

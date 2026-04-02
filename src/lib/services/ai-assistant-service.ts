/**
 * AI Assistant Service
 *
 * Handles Anthropic API interaction for the in-app AI assistant.
 * Uses the Terp handbook as context via prompt caching.
 * Stateless module export following the existing service pattern.
 */
import Anthropic from "@anthropic-ai/sdk"
import fs from "fs"
import path from "path"
import crypto from "crypto"
import type { PrismaClient } from "@/generated/prisma/client"
import { serverEnv } from "@/lib/config"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Error Classes ---

export class AiAssistantValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiAssistantValidationError"
  }
}

export class AiAssistantRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiAssistantRateLimitError"
  }
}

// --- Constants ---

const MODEL = "claude-haiku-4-5-20251001"
const MAX_INPUT_LENGTH = 500
const MAX_HISTORY_PAIRS = 10
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

// --- Handbook Loading (module-level singleton) ---

let handbookContent: string
try {
  handbookContent = fs.readFileSync(
    path.join(process.cwd(), "docs", "TERP_HANDBUCH.md"),
    "utf-8"
  )
} catch {
  // Fallback for build time / environments where the handbook file may not exist
  handbookContent = ""
  console.warn("[AiAssistant] Could not load handbook file")
}

// --- Anthropic Client (lazy singleton) ---

let anthropicClient: Anthropic | null = null

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: serverEnv.anthropicApiKey,
    })
  }
  return anthropicClient
}

// --- System Prompt (stable, gets cached together with handbook) ---

const SYSTEM_PROMPT = `Du bist der Terp-Assistent. Du hilfst Nutzern der ERP-Software Terp bei Fragen zur Bedienung und zu Funktionen.

Dein Stil: Locker, direkt, kollegial. Du sprichst den Nutzer mit "Du" an. Du bist wie ein erfahrener Kollege — kein Roboter, kein Servicecenter.

Regeln:
- Antworte immer auf Deutsch
- Beziehe dich ausschließlich auf das Terp-Handbuch das dir zur Verfügung steht
- Wenn etwas nicht im Handbuch steht, sag das ehrlich
- Erfinde keine Funktionen oder Menüpunkte
- Keine Emojis im Fließtext
- Der Nutzer gibt dir seinen gewünschten Antwortmodus als Prefix mit. Halte dich daran.

Das vollständige Terp-Handbuch folgt nach diesem Block.`

// --- Rate Limiting (DB-based via audit_logs) ---

async function checkRateLimit(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)

  const count = await prisma.auditLog.count({
    where: {
      userId,
      entityType: "ai_assistant_query",
      performedAt: { gte: oneHourAgo },
    },
  })

  if (count >= RATE_LIMIT_MAX) {
    throw new AiAssistantRateLimitError(
      "Zu viele Anfragen. Bitte warte eine Stunde und versuche es erneut."
    )
  }
}

// --- Types ---

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

// --- Main Function ---

export async function askQuestion(
  prisma: PrismaClient,
  params: {
    tenantId: string
    userId: string
    question: string
    mode: "kompakt" | "ausfuehrlich"
    history: ChatMessage[]
  },
  audit: AuditContext
): Promise<{ answer: string }> {
  // Validate input
  const trimmed = params.question.trim()
  if (!trimmed) {
    throw new AiAssistantValidationError("Die Frage darf nicht leer sein.")
  }
  if (trimmed.length > MAX_INPUT_LENGTH) {
    throw new AiAssistantValidationError(
      `Die Frage darf maximal ${MAX_INPUT_LENGTH} Zeichen lang sein.`
    )
  }

  // Rate limit check
  await checkRateLimit(prisma, params.userId)

  // Truncate history to last MAX_HISTORY_PAIRS pairs (20 messages)
  const maxMessages = MAX_HISTORY_PAIRS * 2
  const truncatedHistory = params.history.slice(-maxMessages)

  // Build prefixed question with mode instruction (prefix keeps system prompt stable for caching)
  const modeLabel = params.mode === "kompakt" ? "Kompakt" : "Ausführlich"
  const prefixedQuestion = `[Antwortmodus: ${modeLabel}]\n\n${trimmed}`

  // Build messages array
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...truncatedHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: prefixedQuestion },
  ]

  // Call Anthropic API
  const client = getClient()
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: params.mode === "kompakt" ? 500 : 2000,
    system: [
      {
        type: "text" as const,
        text: SYSTEM_PROMPT,
      },
      {
        type: "text" as const,
        text: handbookContent,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages,
  })

  // Extract answer
  const firstBlock = response.content[0]
  const answer =
    firstBlock && firstBlock.type === "text" ? firstBlock.text : ""

  // Audit log (fire-and-forget)
  auditLog
    .log(prisma, {
      tenantId: params.tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "ai_assistant_query",
      entityId: crypto.randomUUID(),
      entityName: params.question.substring(0, 200),
      changes: null,
      metadata: {
        mode: params.mode,
        historyLength: params.history.length,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))

  return { answer }
}

/**
 * Streaming variant of askQuestion.
 * Returns a ReadableStream that emits SSE events with text deltas.
 */
export async function askQuestionStream(
  prisma: PrismaClient,
  params: {
    tenantId: string
    userId: string
    question: string
    mode: "kompakt" | "ausfuehrlich"
    history: ChatMessage[]
  },
  audit: AuditContext
): Promise<ReadableStream> {
  // Validate input
  const trimmed = params.question.trim()
  if (!trimmed) {
    throw new AiAssistantValidationError("Die Frage darf nicht leer sein.")
  }
  if (trimmed.length > MAX_INPUT_LENGTH) {
    throw new AiAssistantValidationError(
      `Die Frage darf maximal ${MAX_INPUT_LENGTH} Zeichen lang sein.`
    )
  }

  // Rate limit check
  await checkRateLimit(prisma, params.userId)

  // Truncate history
  const maxMessages = MAX_HISTORY_PAIRS * 2
  const truncatedHistory = params.history.slice(-maxMessages)

  // Build prefixed question
  const modeLabel = params.mode === "kompakt" ? "Kompakt" : "Ausführlich"
  const prefixedQuestion = `[Antwortmodus: ${modeLabel}]\n\n${trimmed}`

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...truncatedHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: prefixedQuestion },
  ]

  const client = getClient()

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: params.mode === "kompakt" ? 500 : 2000,
    system: [
      {
        type: "text" as const,
        text: SYSTEM_PROMPT,
      },
      {
        type: "text" as const,
        text: handbookContent,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages,
  })

  // Audit log (fire-and-forget)
  auditLog
    .log(prisma, {
      tenantId: params.tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "ai_assistant_query",
      entityId: crypto.randomUUID(),
      entityName: params.question.substring(0, 200),
      changes: null,
      metadata: {
        mode: params.mode,
        historyLength: params.history.length,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    })
    .catch((err) => console.error("[AuditLog] Failed:", err))

  // Convert Anthropic stream to SSE ReadableStream
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            )
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      } catch (err) {
        console.error("[AI Assistant] Stream error:", err)
        const message = getAnthropicErrorMessage(err)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: message })}\n\n`
          )
        )
        controller.close()
      }
    },
  })
}

// --- Error Helpers ---

function getAnthropicErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Ein unerwarteter Fehler ist aufgetreten."

  const msg = err.message.toLowerCase()

  if (msg.includes("rate_limit") || msg.includes("rate limit") || msg.includes("429")) {
    return "Die Anthropic API ist gerade überlastet (Rate Limit). Bitte warte eine Minute und versuche es erneut."
  }
  if (msg.includes("overloaded") || msg.includes("529")) {
    return "Die Anthropic API ist gerade überlastet. Bitte versuche es in ein paar Minuten erneut."
  }
  if (msg.includes("authentication") || msg.includes("401")) {
    return "API-Schlüssel ungültig. Bitte kontaktiere den Administrator."
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "Die Anfrage hat zu lange gedauert. Bitte versuche es erneut."
  }

  return "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut."
}

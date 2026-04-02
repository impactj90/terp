# AI Assistant — Implementation Plan

**Date:** 2026-04-02
**Feature:** In-app AI assistant that answers user questions about the Terp handbook
**Approach:** Anthropic API with prompt caching (full handbook in system prompt), no RAG, no DB chat storage

---

## Phase 1: Environment & Dependencies

### 1.1 Install Anthropic SDK

**Command:** `pnpm add @anthropic-ai/sdk`

### 1.2 Add `ANTHROPIC_API_KEY` to environment config

**File: `src/lib/config.ts`**
- Add `anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? ''` to the `serverEnv` object
- Add `'ANTHROPIC_API_KEY'` to the `required` array inside `validateEnv()`

**File: `.env.example`**
- Add `ANTHROPIC_API_KEY=<your-anthropic-api-key>` with a comment `# AI Assistant (Anthropic)`

### 1.3 Add `ANTHROPIC_API_KEY` to local `.env`

Set the real API key in the local `.env` file (not committed).

### Verification
- `pnpm typecheck` passes with the new `serverEnv.anthropicApiKey` property
- `.env.example` has the new key documented

---

## Phase 2: Backend Service

### 2.1 Create the AI assistant service

**File: `src/lib/services/ai-assistant-service.ts`**

This service handles all Anthropic API interaction and rate limiting. It is a stateless module export following the existing service pattern (e.g., `users-service.ts`).

**Contents:**

1. **Imports:**
   - `Anthropic` from `@anthropic-ai/sdk`
   - `fs` and `path` from Node.js (for loading handbook)
   - `serverEnv` from `@/lib/config`
   - `* as auditLog` from `./audit-logs-service`
   - `AuditContext` type from `./audit-logs-service`
   - `PrismaClient` type from `@/generated/prisma/client`

2. **Error classes:**
   - `AiAssistantValidationError extends Error` — name: `"AiAssistantValidationError"`. Used for input too long, empty input, etc.
   - `AiAssistantRateLimitError extends Error` — name: `"AiAssistantRateLimitError"`. Used when user exceeds 20 requests/hour. **Important:** The suffix is not in the standard `handleServiceError` map, so this will need a custom mapping (see Phase 3 router notes).

3. **Constants:**
   - `MODEL = "claude-sonnet-4-20250514"`
   - `MAX_INPUT_LENGTH = 500`
   - `MAX_HISTORY_PAIRS = 10` (10 user + 10 assistant = 20 messages)
   - `RATE_LIMIT_MAX = 20`
   - `RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000` (1 hour)

4. **Handbook loading (module-level singleton):**
   - Load `docs/TERP_HANDBUCH.md` using `fs.readFileSync(path.join(process.cwd(), 'docs', 'TERP_HANDBUCH.md'), 'utf-8')` at module load time
   - Store in a module-level `let handbookContent: string` variable
   - This follows the same pattern as `src/app/[locale]/hilfe/page.tsx` which also reads this file with `fs.readFileSync`
   - The content is loaded once when the module is first imported and stays in memory

5. **Anthropic client (module-level singleton):**
   - `let anthropicClient: Anthropic | null = null`
   - `function getClient(): Anthropic` — lazily creates and caches the Anthropic client using `serverEnv.anthropicApiKey`
   - Lazy init avoids errors during build when env var is not set

6. **System prompt construction:**
   - A function `getSystemPrompt(): string` that returns the full system prompt with the handbook embedded
   - Template:
     ```
     Du bist der Terp Assistent, ein hilfreicher KI-Assistent für die ERP-Software Terp.
     
     Deine Aufgabe:
     - Beantworte Fragen der Benutzer auf Basis des Terp-Benutzerhandbuchs
     - Antworte immer auf Deutsch
     - Verweise auf konkrete Menüpfade und Abschnitte im Handbuch
     - Wenn du dir nicht sicher bist, sage es ehrlich
     - Erfinde keine Funktionen, die nicht im Handbuch beschrieben sind
     
     Hier ist das vollständige Terp-Benutzerhandbuch:
     
     <handbook>
     ${handbookContent}
     </handbook>
     ```
   - The system prompt is returned as a single string — the Anthropic SDK `system` parameter accepts this, and Anthropic's prompt caching will cache the static system prompt block automatically

7. **Rate limiting (in-memory):**
   - `const rateLimitMap = new Map<string, number[]>()` — maps `userId` to array of timestamps
   - `function checkRateLimit(userId: string): void` — checks if user has exceeded `RATE_LIMIT_MAX` calls within `RATE_LIMIT_WINDOW_MS`. If exceeded, throws `AiAssistantRateLimitError`. Cleans up expired entries.
   - This is intentionally simple in-memory rate limiting. It resets on server restart, which is acceptable for MVP. No Redis or DB needed.

8. **Message type:**
   - Define `interface ChatMessage { role: 'user' | 'assistant'; content: string }` for the conversation history

9. **Main function — `askQuestion`:**
   ```
   export async function askQuestion(
     prisma: PrismaClient,
     params: {
       tenantId: string
       userId: string
       question: string
       mode: 'kompakt' | 'ausfuehrlich'
       history: ChatMessage[]
     },
     audit: AuditContext
   ): Promise<{ answer: string }>
   ```
   - **Validate** input: `question.length > MAX_INPUT_LENGTH` throws `AiAssistantValidationError`; empty/whitespace-only question throws `AiAssistantValidationError`
   - **Rate limit check:** call `checkRateLimit(params.userId)`
   - **Build messages array:** Convert `history` to Anthropic message format, then append the current question. Prepend the mode instruction to the user message:
     - Kompakt: `"[Antworte kompakt in 2-4 Sätzen]\n\n${question}"`
     - Ausfuehrlich: `"[Antworte ausführlich mit Details und Beispielen]\n\n${question}"`
   - **Truncate history:** Only take the last `MAX_HISTORY_PAIRS` pairs (20 messages) from history
   - **Call Anthropic API:**
     ```
     const response = await client.messages.create({
       model: MODEL,
       max_tokens: mode === 'kompakt' ? 500 : 2000,
       system: [{ type: 'text', text: getSystemPrompt(), cache_control: { type: 'ephemeral' } }],
       messages: [...truncatedHistory, { role: 'user', content: prefixedQuestion }],
     })
     ```
   - The `cache_control: { type: 'ephemeral' }` on the system prompt block enables Anthropic's prompt caching — the handbook will be cached across requests
   - **Extract answer:** `response.content[0].type === 'text' ? response.content[0].text : ''`
   - **Audit log (fire-and-forget):**
     ```
     auditLog.log(prisma, {
       tenantId: params.tenantId,
       userId: audit.userId,
       action: 'create',
       entityType: 'ai_assistant_query',
       entityId: crypto.randomUUID(),
       entityName: params.question.substring(0, 100),
       changes: null,
       metadata: { mode: params.mode, historyLength: params.history.length },
       ipAddress: audit.ipAddress,
       userAgent: audit.userAgent,
     }).catch(err => console.error('[AuditLog] Failed:', err))
     ```
   - **Return** `{ answer }`

### Verification
- File exists at `src/lib/services/ai-assistant-service.ts`
- Exports: `askQuestion`, `ChatMessage`, `AiAssistantValidationError`, `AiAssistantRateLimitError`
- `pnpm typecheck` passes (modulo the pre-existing ~1463 errors)

---

## Phase 3: tRPC Router

### 3.1 Create the AI assistant router

**File: `src/trpc/routers/aiAssistant.ts`**

Follow the pattern from `src/trpc/routers/tenantModules.ts` (thin wrapper calling service).

**Contents:**

1. **Imports:**
   - `z` from `zod`
   - `createTRPCRouter`, `tenantProcedure` from `@/trpc/init`
   - `handleServiceError` from `@/trpc/errors`
   - `TRPCError` from `@trpc/server`
   - `* as aiAssistantService` from `@/lib/services/ai-assistant-service`

2. **Input schema:**
   ```
   const askQuestionInput = z.object({
     question: z.string().min(1).max(500),
     mode: z.enum(['kompakt', 'ausfuehrlich']).default('kompakt'),
     history: z.array(z.object({
       role: z.enum(['user', 'assistant']),
       content: z.string(),
     })).max(20).default([]),
   })
   ```

3. **Output schema:**
   ```
   const askQuestionOutput = z.object({
     answer: z.string(),
   })
   ```

4. **Router definition:**
   ```
   export const aiAssistantRouter = createTRPCRouter({
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
             { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
           )
         } catch (err) {
           // Custom handling for rate limit error (not in standard handleServiceError map)
           if (err instanceof Error && err.name === 'AiAssistantRateLimitError') {
             throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: err.message })
           }
           handleServiceError(err)
         }
       }),
   })
   ```

   **Note:** `handleServiceError` does not have a mapping for `*RateLimitError`. The rate limit error needs to be caught explicitly and mapped to `TOO_MANY_REQUESTS` before falling through to `handleServiceError`. The `AiAssistantValidationError` will be correctly mapped to `BAD_REQUEST` by the existing `*ValidationError` suffix matching in `handleServiceError`.

5. **No permission middleware** — the AI assistant is available to all authenticated users (uses `tenantProcedure` which requires auth + tenant). No `requirePermission()` needed.

6. **No module guard** — the AI assistant is a core feature, available to all tenants. No `requireModule()` needed.

### 3.2 Register the router in `_app.ts`

**File: `src/trpc/routers/_app.ts`**

- Add import: `import { aiAssistantRouter } from "./aiAssistant"`
- Add to `appRouter` object: `aiAssistant: aiAssistantRouter,`
- Place alphabetically after `accessProfiles` or at the end before `crm`/`billing`/`warehouse`/`hr` (the nested routers)

### Verification
- `pnpm typecheck` passes
- The router is accessible as `trpc.aiAssistant.askQuestion`

---

## Phase 4: Frontend Hook

### 4.1 Create the AI assistant hook

**File: `src/hooks/use-ai-assistant.ts`**

Follow the mutation hook pattern from `src/hooks/use-bookings.ts`.

**Contents:**

1. **Imports:**
   - `useTRPC` from `@/trpc`
   - `useMutation` from `@tanstack/react-query`

2. **Hook: `useAskQuestion`**
   ```
   export function useAskQuestion() {
     const trpc = useTRPC()
     return useMutation({
       ...trpc.aiAssistant.askQuestion.mutationOptions(),
     })
   }
   ```

   No query invalidation needed — this is a stateless mutation that returns a response. There is no cache to invalidate.

### 4.2 Register in hooks barrel

**File: `src/hooks/index.ts`**

Add at the bottom (or in alphabetical position among domain hooks):
```
// AI Assistant
export { useAskQuestion } from './use-ai-assistant'
```

### Verification
- `pnpm typecheck` passes
- Hook is importable from `@/hooks`

---

## Phase 5: Frontend Component — Chat Panel

### 5.1 Create the AI assistant component directory

**Directory: `src/components/ai-assistant/`**

This follows the existing component organization pattern (feature-specific directories under `src/components/`).

### 5.2 Create the chat message component

**File: `src/components/ai-assistant/chat-message.tsx`**

A presentational component for rendering a single chat message bubble.

**Structure:**
- Props: `{ role: 'user' | 'assistant'; content: string }`
- User messages: right-aligned, primary background color, plain text
- Assistant messages: left-aligned, muted background, rendered with `ReactMarkdown` + `remarkGfm`
- Use `cn()` for conditional styling
- For the assistant markdown rendering, create a simplified set of markdown components (simpler than the full hilfe-page set — no TOC anchors needed, just basic formatting: paragraphs, bold, lists, tables, code blocks, headings)
- Wrap the markdown component in `memo()` for performance (follow the `MemoizedMarkdown` pattern from `hilfe-page.tsx`)
- Import icons from `lucide-react`: `Bot` for assistant avatar, `User` for user avatar

### 5.3 Create the typing indicator component

**File: `src/components/ai-assistant/typing-indicator.tsx`**

A small animated component showing three bouncing dots when the assistant is generating a response.

**Structure:**
- Three `span` elements with staggered CSS animation
- Use Tailwind `animate-bounce` with animation-delay utility classes
- Wrapped in the same layout as an assistant message (left-aligned, with Bot icon)

### 5.4 Create the main chat panel component

**File: `src/components/ai-assistant/ai-assistant-panel.tsx`**

This is the main chat panel component. It manages conversation state and renders the full chat UI.

**Structure:**

1. **'use client'** directive at the top

2. **Imports:**
   - React: `useState`, `useRef`, `useEffect`, `useCallback`
   - `useAskQuestion` from `@/hooks/use-ai-assistant`
   - `ChatMessage` component from `./chat-message`
   - `TypingIndicator` from `./typing-indicator`
   - UI primitives: `Button` from `@/components/ui/button`, `Input` from `@/components/ui/input` (or `Textarea`)
   - Icons from `lucide-react`: `X`, `MessageSquarePlus`, `Send`, `Bot`
   - `cn` from `@/lib/utils`

3. **Props:**
   ```
   interface AiAssistantPanelProps {
     open: boolean
     onClose: () => void
   }
   ```

4. **State:**
   - `messages: Array<{ role: 'user' | 'assistant'; content: string }>` — conversation history, initialized to `[]`
   - `inputValue: string` — current input text
   - `mode: 'kompakt' | 'ausfuehrlich'` — answer mode, default `'kompakt'`
   - `showDisclaimer: boolean` — shows disclaimer on first open per session, initialized to `true`

5. **Refs:**
   - `messagesEndRef` — for auto-scrolling to bottom on new messages
   - `inputRef` — for auto-focusing the input field

6. **Mutation:**
   - `const askMutation = useAskQuestion()`
   - `askMutation.isPending` controls loading state / typing indicator

7. **Handlers:**
   - `handleSend()` — validates input not empty, adds user message to state, calls `askMutation.mutateAsync({ question, mode, history: messages })`, on success adds assistant response to messages, clears input, on error adds error message to messages
   - `handleNewChat()` — resets `messages` to `[]`
   - `handleKeyDown()` — sends on Enter (without Shift), allows newline on Shift+Enter
   - `dismissDisclaimer()` — sets `showDisclaimer` to `false`

8. **Auto-scroll effect:**
   - `useEffect` that scrolls `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })` when `messages` changes

9. **Layout (rendered only when `open` is true):**
   ```
   Fixed position panel: bottom-right corner
   - Position: fixed, bottom-20 (above FAB), right-4
   - On mobile: bottom-[calc(var(--bottom-nav-height)+var(--safe-area-bottom)+4rem)], left-4, right-4
   - On desktop: right-6, bottom-6, width 400px, max-height 600px
   - z-index: 50 (above content, below modals)
   - Border, rounded-lg, shadow-lg, bg-background
   - Flex column layout
   ```

   **Header bar:**
   - Left: Bot icon + "Terp Assistent" title
   - Right: "Neuer Chat" button (MessageSquarePlus icon) + Close button (X icon)

   **Disclaimer (conditional):**
   - Shown only when `showDisclaimer` is true
   - Text: "Dies ist ein KI-Assistent. Antworten basieren auf dem Terp-Handbuch und koennen ungenau sein. Bitte verifiziere wichtige Informationen."
   - "Verstanden" button to dismiss

   **Mode toggle (segmented control):**
   - Two buttons side by side above the input area: "Kompakt" | "Ausfuehrlich"
   - Active state uses primary styling, inactive uses ghost/outline
   - Follow the pattern of segmented controls already used in the app (ButtonGroup-like pattern using `cn()` for active/inactive states)

   **Message list:**
   - Scrollable area (flex-1, overflow-y-auto)
   - Empty state: centered text "Stelle eine Frage zum Terp-Handbuch..."
   - Maps over `messages` array rendering `ChatMessage` for each
   - Shows `TypingIndicator` when `askMutation.isPending`
   - `<div ref={messagesEndRef} />` at the bottom for auto-scroll anchor

   **Input area:**
   - Row with text input + send button
   - Input: placeholder "Frage eingeben..." with maxLength=500
   - Send button: `Send` icon, disabled when input is empty or mutation is pending
   - Character counter showing `${inputValue.length}/500`

### 5.5 Create the FAB (Floating Action Button) component

**File: `src/components/ai-assistant/ai-assistant-fab.tsx`**

The floating button that toggles the chat panel open/closed.

**Structure:**

1. **'use client'** directive

2. **Imports:**
   - `useState` from React
   - `AiAssistantPanel` from `./ai-assistant-panel`
   - `Button` from `@/components/ui/button`
   - `MessageCircle`, `X` from `lucide-react`
   - `cn` from `@/lib/utils`

3. **State:**
   - `isOpen: boolean` — whether the chat panel is open

4. **Layout:**
   ```
   Fixed position button: bottom-right corner
   - Position: fixed
   - On mobile: bottom-[calc(var(--bottom-nav-height)+var(--safe-area-bottom)+0.5rem)], right-4
   - On desktop: bottom-6, right-6
   - z-index: 50
   - Round button (rounded-full), size 14 (56px), primary color
   - Icon: MessageCircle when closed, X when open
   - Shadow-lg for elevation
   ```

5. **Renders:**
   - The FAB button itself
   - `<AiAssistantPanel open={isOpen} onClose={() => setIsOpen(false)} />`

### 5.6 Create barrel export

**File: `src/components/ai-assistant/index.ts`**

```
export { AiAssistantFab } from './ai-assistant-fab'
```

### Verification
- All component files exist and typecheck
- Components are importable from `@/components/ai-assistant`

---

## Phase 6: Integration into App Layout

### 6.1 Add FAB to the app layout

**File: `src/components/layout/app-layout.tsx`**

This is where the FAB gets injected into the application so it appears on every page for logged-in users.

**Changes:**
- Import `AiAssistantFab` from `@/components/ai-assistant`
- Inside `AppLayoutContent`, after the `<MobileSidebarSheet>` and before the closing `</>`, render `{isAuthenticated && <AiAssistantFab />}` — the FAB only renders for authenticated users
- The `isAuthenticated` boolean is already available from `useAuth()` in this component

### Verification
- `pnpm dev` — FAB appears bottom-right when logged in
- FAB does not appear on unauthenticated pages (login)
- Clicking FAB opens chat panel
- Clicking X or FAB again closes panel

---

## Phase 7: End-to-End Testing

### 7.1 Manual verification checklist

1. **Login** and verify FAB appears
2. **Click FAB** — panel opens with disclaimer
3. **Dismiss disclaimer** — disclaimer disappears for the session
4. **Type a question** (e.g., "Wie erstelle ich einen neuen Mitarbeiter?") and send
5. **Verify** assistant response appears with markdown formatting
6. **Verify** response references handbook content (menu paths, steps)
7. **Toggle mode** to "Ausfuehrlich" and ask the same question — response should be longer
8. **Ask follow-up** — conversation history is maintained
9. **Click "Neuer Chat"** — messages are cleared
10. **Verify** character counter shows limit and input is capped at 500 chars
11. **Close panel** — messages persist when reopening (until "Neuer Chat" or page reload)
12. **Reload page** — messages are gone (no persistence across page loads)
13. **Check mobile** — FAB positioned above bottom nav, panel fills width
14. **Rate limiting** — not easily testable manually (20/hour limit)

### 7.2 Audit log verification

- After sending a question, check the Audit Log page (Administration > Audit-Log)
- Verify an entry appears with `entityType: "ai_assistant_query"`, `action: "create"`

---

## File Summary

### Files to CREATE:

| # | File | Description |
|---|------|-------------|
| 1 | `src/lib/services/ai-assistant-service.ts` | Service: Anthropic API, rate limiting, handbook loading |
| 2 | `src/trpc/routers/aiAssistant.ts` | tRPC router: thin wrapper with input validation |
| 3 | `src/hooks/use-ai-assistant.ts` | React hook: `useAskQuestion` mutation |
| 4 | `src/components/ai-assistant/chat-message.tsx` | Chat message bubble with markdown rendering |
| 5 | `src/components/ai-assistant/typing-indicator.tsx` | Animated typing dots |
| 6 | `src/components/ai-assistant/ai-assistant-panel.tsx` | Main chat panel (state, UI, interaction) |
| 7 | `src/components/ai-assistant/ai-assistant-fab.tsx` | Floating action button |
| 8 | `src/components/ai-assistant/index.ts` | Barrel export |

### Files to MODIFY:

| # | File | Change |
|---|------|--------|
| 1 | `src/lib/config.ts` | Add `anthropicApiKey` to `serverEnv`, add to `validateEnv()` |
| 2 | `.env.example` | Add `ANTHROPIC_API_KEY` |
| 3 | `src/trpc/routers/_app.ts` | Import and register `aiAssistantRouter` |
| 4 | `src/hooks/index.ts` | Export `useAskQuestion` |
| 5 | `src/components/layout/app-layout.tsx` | Import and render `AiAssistantFab` for authenticated users |

### Dependencies to INSTALL:

| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk` | Anthropic API client |

---

## Implementation Order

```
Phase 1 (Environment)     ← No dependencies
  │
  ▼
Phase 2 (Service)         ← Depends on Phase 1 (serverEnv.anthropicApiKey)
  │
  ▼
Phase 3 (Router)          ← Depends on Phase 2 (service)
  │
  ▼
Phase 4 (Hook)            ← Depends on Phase 3 (router registered)
  │
  ▼
Phase 5 (Components)      ← Depends on Phase 4 (hook)
  │
  ▼
Phase 6 (Integration)     ← Depends on Phase 5 (FAB component)
  │
  ▼
Phase 7 (Testing)         ← Depends on Phase 6 (everything wired up)
```

---

## Success Criteria

1. FAB visible on every page for logged-in users, hidden for anonymous
2. Chat panel opens/closes when FAB is clicked
3. Disclaimer shown on first open per session
4. Mode toggle switches between "Kompakt" and "Ausfuehrlich"
5. User can type a question (max 500 chars) and receive an AI-generated answer based on the handbook
6. Assistant responses render as formatted markdown
7. Conversation history is maintained within the panel session
8. "Neuer Chat" clears the conversation
9. Page reload clears the conversation
10. Auto-scroll on new messages
11. Loading indicator (typing dots) shown while waiting for response
12. Rate limiting enforced (20 requests/user/hour)
13. Each query logged to audit log with `entityType: "ai_assistant_query"`
14. Anthropic prompt caching active (handbook sent as cached system prompt block)
15. No new database tables or migrations needed
16. `pnpm typecheck` passes (no new errors beyond the pre-existing ~1463)
17. `pnpm lint` passes

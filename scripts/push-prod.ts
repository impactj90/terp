#!/usr/bin/env node
// Push pending Supabase migrations to PRODUCTION.
//
// Usage: node --env-file=.env.production scripts/push-prod.ts
//   (wired up as `pnpm db:push:prod`)
//
// Safety:
//   - Runs `supabase db push --dry-run` first and shows the plan
//   - Requires the operator to type the exact production project ref
//     (extracted from the DB URL) to confirm
//   - Never falls back to a linked project — the DB URL is always
//     passed explicitly via --db-url to avoid mistaken staging pushes
//
// The connection string is read from POSTGRES_URL_NON_POOLING in
// .env.production (port 5432, session-mode), falling back to
// DATABASE_URL if the non-pooling variant is not set.

import { execSync, spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as readline from 'node:readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const rawUrl =
  process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL

if (!rawUrl) {
  console.error(
    'Neither POSTGRES_URL_NON_POOLING nor DATABASE_URL is set.\n' +
      'Load the production env via --env-file=.env.production or export one of them.'
  )
  process.exit(1)
}

// Clean up the URL for Supabase CLI / psql: drop pgbouncer/supa query
// params and downgrade sslmode=no-verify to sslmode=require.
const url = new URL(rawUrl)
url.searchParams.delete('supa')
url.searchParams.delete('pgbouncer')
if (url.searchParams.get('sslmode') === 'no-verify') {
  url.searchParams.set('sslmode', 'require')
}
const cleanUrl = url.toString()

// Extract the Supabase project ref (subdomain or "postgres.<ref>" user)
// for the confirmation prompt. Both pooler hosts and direct hosts
// encode the ref somewhere:
//   - Direct host:   db.<ref>.supabase.co
//   - Pooler host:   aws-1-eu-central-1.pooler.supabase.com → user = postgres.<ref>
let projectRef: string | null = null
const hostMatch = url.hostname.match(/^db\.([^.]+)\.supabase\.co$/)
if (hostMatch) {
  projectRef = hostMatch[1] ?? null
} else if (url.username.startsWith('postgres.')) {
  projectRef = url.username.slice('postgres.'.length)
}

// --- Forward a whitelist of flags from process.argv to the underlying
//     supabase CLI invocations. Today only --include-all is supported;
//     add new entries here if you need to pass more flags through.
const passthroughFlags: string[] = []
if (process.argv.includes('--include-all')) {
  passthroughFlags.push('--include-all')
}

console.log('==========================================')
console.log('  Supabase → PRODUCTION migration push')
console.log('==========================================')
console.log(`Host:        ${url.hostname}:${url.port || '5432'}`)
console.log(`DB:          ${url.pathname.replace(/^\//, '') || 'postgres'}`)
console.log(`Project ref: ${projectRef ?? '(unknown)'}`)
if (passthroughFlags.length > 0) {
  console.log(`Extra flags: ${passthroughFlags.join(' ')}`)
}
console.log('')

// --- Dry-run first so the operator sees what would happen -------------
console.log('[1/2] Running dry-run to show pending migrations…')
console.log('')
const dryRun = spawnSync(
  'npx',
  [
    'supabase',
    'db',
    'push',
    '--db-url',
    cleanUrl,
    '--dry-run',
    ...passthroughFlags,
  ],
  { cwd: repoRoot, stdio: 'inherit' }
)
if (dryRun.status !== 0) {
  console.error('\nDry-run failed — aborting without applying anything.')
  process.exit(dryRun.status ?? 1)
}

// --- Confirmation prompt ----------------------------------------------
console.log('')
console.log('⚠️  You are about to APPLY the migrations listed above to PRODUCTION.')
console.log('   This is a forward-only operation — Supabase does not roll back')
console.log('   DDL automatically. Double-check the plan above before continuing.')
console.log('')

const expected = projectRef ?? 'PRODUCTION'
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})
const answer = await new Promise<string>((res) => {
  rl.question(
    `Type the project ref "${expected}" to confirm (anything else aborts): `,
    res
  )
})
rl.close()

if (answer.trim() !== expected) {
  console.log('Aborted — no migrations applied.')
  process.exit(0)
}

// --- Apply --------------------------------------------------------------
console.log('')
console.log('[2/2] Pushing migrations to production…')
try {
  const applyCmd = [
    'npx',
    'supabase',
    'db',
    'push',
    '--db-url',
    `"${cleanUrl.replace(/"/g, '\\"')}"`,
    ...passthroughFlags,
  ].join(' ')
  execSync(applyCmd, { cwd: repoRoot, stdio: 'inherit' })
  console.log('')
  console.log('✅  Production migrations applied successfully.')
} catch (err) {
  console.error('')
  console.error('❌  Production push failed.')
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}

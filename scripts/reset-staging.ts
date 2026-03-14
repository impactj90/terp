#!/usr/bin/env node
// Reset staging database: drop all tables, re-push migrations, re-seed.
// Usage: node --env-file=.env.staging scripts/reset-staging.ts

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as readline from 'node:readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const seedPath = resolve(__dirname, '..', 'supabase', 'seed.sql')
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Load it via --env-file or export it.')
  process.exit(1)
}

// Strip/fix query params that psql doesn't understand
const url = new URL(databaseUrl)
url.searchParams.delete('supa')
url.searchParams.delete('pgbouncer')
// psql doesn't support sslmode=no-verify, use sslmode=require instead
if (url.searchParams.get('sslmode') === 'no-verify') {
  url.searchParams.set('sslmode', 'require')
}
const cleanUrl = url.toString()

const host = url.hostname
console.log(`Target: ${host}`)
console.log('\n⚠️  This will DROP all data in the staging database and re-seed it.')

// Confirmation prompt
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const answer = await new Promise<string>((resolve) => {
  rl.question('Type "yes" to continue: ', resolve)
})
rl.close()

if (answer.trim().toLowerCase() !== 'yes') {
  console.log('Aborted.')
  process.exit(0)
}

// Step 1: Drop public schema and recreate it
console.log('\n[1/3] Dropping public schema...')
const dropSql = `
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;

-- Clear migration history so supabase db push re-applies all migrations
TRUNCATE supabase_migrations.schema_migrations;
`
execSync(`psql "${cleanUrl}" -v ON_ERROR_STOP=1`, {
  input: dropSql,
  stdio: ['pipe', 'inherit', 'inherit'],
})

// Step 2: Push migrations
console.log('\n[2/3] Pushing migrations...')
execSync('npx supabase db push --linked', {
  cwd: resolve(__dirname, '..'),
  stdio: 'inherit',
})

// Step 3: Seed
console.log('\n[3/3] Running seed.sql...')
const seedSql = readFileSync(seedPath, 'utf-8')
execSync(`psql "${cleanUrl}" -v ON_ERROR_STOP=1`, {
  input: seedSql,
  stdio: ['pipe', 'inherit', 'inherit'],
})

console.log('\nStaging database reset complete.')

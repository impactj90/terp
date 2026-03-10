#!/usr/bin/env node
// Seed staging database with dev users from supabase/seed.sql
// Usage: node --env-file=.env.staging scripts/seed-staging.ts

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const seedPath = resolve(__dirname, '..', 'supabase', 'seed.sql')
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Load it via --env-file or export it.')
  process.exit(1)
}

// Strip Supabase-specific query params that psql doesn't understand
const url = new URL(databaseUrl)
url.searchParams.delete('supa')
url.searchParams.delete('pgbouncer')
const cleanUrl = url.toString()

const host = url.hostname
console.log(`Target: ${host}`)
console.log('Running seed.sql against staging database...')

const sql = readFileSync(seedPath, 'utf-8')
execSync(`psql "${cleanUrl}" -v ON_ERROR_STOP=1`, {
  input: sql,
  stdio: ['pipe', 'inherit', 'inherit'],
})

console.log('Staging seed complete.')

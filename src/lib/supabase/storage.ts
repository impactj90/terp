/**
 * Shared Supabase Storage Service
 *
 * Centralizes all Supabase Storage operations so individual feature services
 * don't duplicate signed-URL generation, upload, download, and delete logic.
 */
import { createAdminClient } from "./admin"
import { clientEnv, serverEnv } from "@/lib/config"

const DEFAULT_SIGNED_URL_EXPIRY = 3600 // 1 hour

/**
 * Fix signed URL when internal Supabase URL differs from the public one
 * (e.g. inside Docker: internal=http://supabase-kong:8000, public=http://localhost:54321).
 */
export function fixSignedUrl(signedUrl: string): string {
  const internalUrl = serverEnv.supabaseUrl
  const publicUrl = clientEnv.supabaseUrl
  if (internalUrl && publicUrl && internalUrl !== publicUrl) {
    return signedUrl.replace(internalUrl, publicUrl)
  }
  return signedUrl
}

/**
 * Build a public URL for a file in a public bucket.
 */
export function getPublicUrl(bucket: string, path: string): string {
  return `${clientEnv.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Generate a signed upload URL for direct client-to-storage upload.
 */
export async function createSignedUploadUrl(bucket: string, path: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path)

  if (error || !data) {
    throw new Error(`Failed to create upload URL: ${error?.message ?? "Unknown error"}`)
  }

  return {
    signedUrl: fixSignedUrl(data.signedUrl),
    path,
    token: data.token,
  }
}

/**
 * Generate a signed download/read URL for a private bucket.
 */
export async function createSignedReadUrl(
  bucket: string,
  path: string,
  expirySeconds = DEFAULT_SIGNED_URL_EXPIRY
) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expirySeconds)

  if (error || !data?.signedUrl) {
    return null
  }

  return fixSignedUrl(data.signedUrl)
}

/**
 * Download a file from storage. Returns the Blob or null on error.
 */
export async function download(bucket: string, path: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) return null
  return data
}

/**
 * Upload a buffer/blob directly from the server.
 */
export async function upload(
  bucket: string,
  path: string,
  body: Buffer | Blob,
  options?: { contentType?: string; upsert?: boolean }
) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, body, options)

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`)
  }

  return data
}

/**
 * Remove one or more files from a bucket. Best-effort — does not throw.
 */
export async function remove(bucket: string, paths: string[]) {
  const supabase = createAdminClient()
  await supabase.storage.from(bucket).remove(paths).catch(() => {})
}

/**
 * Remove files in batches (for large deletions like DSGVO retention).
 * Logs errors but does not throw.
 */
export async function removeBatched(
  bucket: string,
  paths: string[],
  batchSize = 1000
) {
  const supabase = createAdminClient()
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize)
    const { error } = await supabase.storage.from(bucket).remove(batch)
    if (error) {
      console.error(`[storage] Batch cleanup error (${bucket}):`, error.message)
    }
  }
}

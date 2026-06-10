/**
 * Shared utilities for services.
 * Contains common types and helpers used across multiple services
 * to avoid duplication.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServiceResult<T = null> {
  data: T | null
  error: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'An unexpected error occurred'
}

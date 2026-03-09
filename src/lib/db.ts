// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — D1 Database Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a single SELECT query and return one row or null
 */
export async function dbGet<T>(
  db: D1Database,
  sql: string,
  params?: (string | number | boolean | null | undefined)[]
): Promise<T | null> {
  const stmt = db.prepare(sql)
  const result = await stmt.bind(...(params || [])).first<T>()
  return result ?? null
}

/**
 * Execute a SELECT query and return all rows
 */
export async function dbAll<T>(
  db: D1Database,
  sql: string,
  params?: (string | number | boolean | null | undefined)[]
): Promise<T[]> {
  const stmt = db.prepare(sql)
  const result = await stmt.bind(...(params || [])).all<T>()
  return result.results || []
}

/**
 * Execute an INSERT, UPDATE, or DELETE query
 */
export async function dbRun(
  db: D1Database,
  sql: string,
  params?: (string | number | boolean | null | undefined)[]
): Promise<void> {
  const stmt = db.prepare(sql)
  await stmt.bind(...(params || [])).run()
}

/**
 * Generate a unique ID with prefix
 */
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`
}

/**
 * Convert value to JSON string for D1 storage
 */
export function toJson<T>(value: T | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return JSON.stringify(value)
}

/**
 * Parse JSON string from D1 storage
 */
export function fromJson<T>(str: string | null | undefined): T | null {
  if (!str) return null
  try {
    return JSON.parse(str) as T
  } catch {
    return null
  }
}

/**
 * Get current ISO timestamp
 */
export function now(): string {
  return new Date().toISOString()
}

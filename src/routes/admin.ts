// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Admin Module Routes  (Phase ADM-1)
// GET    /api/admin/settings           — get all practice settings (ADMIN)
// PUT    /api/admin/settings           — update practice settings (ADMIN)
// GET    /api/admin/locations          — list locations (ADMIN)
// POST   /api/admin/locations          — create location (ADMIN)
// PUT    /api/admin/locations/:id      — update location (ADMIN)
// DELETE /api/admin/locations/:id      — deactivate location (ADMIN)
// GET    /api/admin/modules            — get module enable/disable states (any auth)
// PUT    /api/admin/modules/:id        — toggle a module (ADMIN)
// GET    /api/admin/users              — list staff users (ADMIN)
// POST   /api/admin/users              — create staff user (ADMIN)
// PUT    /api/admin/users/:id          — update user role/status (ADMIN)
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import { requireAuth, requireRole } from '../middleware/auth'
import { listUsers, createUser, setUserActive } from '../lib/auth'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DB: D1Database
  JWT_SECRET?: string
}

const admin = new Hono<{ Bindings: Bindings }>()

// ── All admin routes require authentication ───────────────────────────────────
admin.use('/*', requireAuth)

// ── Helper: get all settings as a map ────────────────────────────────────────
async function getAllSettings(db: D1Database): Promise<Record<string, string>> {
  try {
    const rows = await db.prepare('SELECT key, value FROM practice_settings').all()
    const map: Record<string, string> = {}
    for (const row of (rows.results as { key: string; value: string }[])) {
      map[row.key] = row.value ?? ''
    }
    return map
  } catch {
    return {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRACTICE SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

admin.get('/settings', requireRole(['ADMIN']), async (c) => {
  try {
    const settings = await getAllSettings(c.env.DB)
    return c.json({ success: true, data: settings })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

admin.put('/settings', requireRole(['ADMIN']), async (c) => {
  try {
    const body = await c.req.json() as Record<string, string>
    const auth = c.get('auth' as any) as any
    const updatedBy = auth?.userId ?? 'unknown'

    const stmt = c.env.DB.prepare(
      'INSERT OR REPLACE INTO practice_settings (key, value, updated_at, updated_by) VALUES (?, ?, CURRENT_TIMESTAMP, ?)'
    )

    const updates = Object.entries(body)
    for (const [key, value] of updates) {
      await stmt.bind(key, String(value), updatedBy).run()
    }

    const settings = await getAllSettings(c.env.DB)
    return c.json({ success: true, data: settings, updated: updates.length })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// LOCATIONS
// ─────────────────────────────────────────────────────────────────────────────

admin.get('/locations', requireRole(['ADMIN', 'PROVIDER', 'FRONT_DESK']), async (c) => {
  try {
    const rows = await c.env.DB.prepare(
      'SELECT * FROM locations ORDER BY is_active DESC, name ASC'
    ).all()
    return c.json({ success: true, data: rows.results })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

admin.post('/locations', requireRole(['ADMIN']), async (c) => {
  try {
    const body = await c.req.json() as any
    const id = `loc-${Date.now()}`
    await c.env.DB.prepare(
      `INSERT INTO locations (id, name, address, city, state, zip, phone, fax, timezone, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(
      id,
      body.name || 'New Location',
      body.address || '',
      body.city || '',
      body.state || '',
      body.zip || '',
      body.phone || '',
      body.fax || '',
      body.timezone || 'America/New_York'
    ).run()

    const loc = await c.env.DB.prepare('SELECT * FROM locations WHERE id = ?').bind(id).first()
    return c.json({ success: true, data: loc }, 201)
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

admin.put('/locations/:id', requireRole(['ADMIN']), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json() as any

    await c.env.DB.prepare(
      `UPDATE locations SET
        name = COALESCE(?, name),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        zip = COALESCE(?, zip),
        phone = COALESCE(?, phone),
        fax = COALESCE(?, fax),
        timezone = COALESCE(?, timezone),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      body.name ?? null,
      body.address ?? null,
      body.city ?? null,
      body.state ?? null,
      body.zip ?? null,
      body.phone ?? null,
      body.fax ?? null,
      body.timezone ?? null,
      body.is_active !== undefined ? (body.is_active ? 1 : 0) : null,
      id
    ).run()

    const loc = await c.env.DB.prepare('SELECT * FROM locations WHERE id = ?').bind(id).first()
    return c.json({ success: true, data: loc })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

admin.delete('/locations/:id', requireRole(['ADMIN']), async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(
      'UPDATE locations SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(id).run()
    return c.json({ success: true, message: 'Location deactivated' })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// MODULE SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

// Public (any authenticated user) — needed for nav rendering
admin.get('/modules', async (c) => {
  try {
    const rows = await c.env.DB.prepare(
      'SELECT module_id, label, is_enabled, category, sort_order FROM module_settings ORDER BY sort_order ASC'
    ).all()
    return c.json({ success: true, data: rows.results })
  } catch (err) {
    // If table doesn't exist yet, return all enabled
    return c.json({ success: true, data: [], error: 'Module settings not initialized' })
  }
})

admin.put('/modules/:id', requireRole(['ADMIN']), async (c) => {
  try {
    const moduleId = c.req.param('id')
    const { is_enabled } = await c.req.json() as { is_enabled: boolean }
    const auth = c.get('auth' as any) as any
    const updatedBy = auth?.userId ?? 'unknown'

    await c.env.DB.prepare(
      'UPDATE module_settings SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE module_id = ?'
    ).bind(is_enabled ? 1 : 0, updatedBy, moduleId).run()

    const module = await c.env.DB.prepare(
      'SELECT * FROM module_settings WHERE module_id = ?'
    ).bind(moduleId).first()

    return c.json({ success: true, data: module })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT (proxy to auth lib)
// ─────────────────────────────────────────────────────────────────────────────

admin.get('/users', requireRole(['ADMIN']), async (c) => {
  try {
    const users = await listUsers(c.env.OCULOFLOW_KV, c.env.DB)
    return c.json({ success: true, data: users })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

admin.post('/users', requireRole(['ADMIN']), async (c) => {
  try {
    const body = await c.req.json() as any
    const { email, displayName, role, password } = body

    if (!email || !displayName || !role) {
      return c.json({ success: false, error: 'email, displayName, and role are required' }, 400)
    }

    const user = await createUser(c.env.OCULOFLOW_KV, {
      email,
      displayName,
      role,
      password: password || 'TempPass@123!',
    }, c.env.DB)

    return c.json({ success: true, data: user }, 201)
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

admin.put('/users/:id', requireRole(['ADMIN']), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json() as any

    // Handle active/inactive toggle
    if (body.is_active !== undefined) {
      await setUserActive(c.env.OCULOFLOW_KV, id, body.is_active, c.env.DB)
    }

    // Handle role update via D1
    if (body.role) {
      await c.env.DB.prepare(
        'UPDATE staff_users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(body.role, id).run()
    }

    const users = await listUsers(c.env.OCULOFLOW_KV, c.env.DB)
    const updated = users.find((u: any) => u.id === id)
    return c.json({ success: true, data: updated })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD SUMMARY (for admin overview page)
// ─────────────────────────────────────────────────────────────────────────────

admin.get('/dashboard', requireRole(['ADMIN']), async (c) => {
  try {
    const [settings, locRows, modRows, userRows] = await Promise.all([
      getAllSettings(c.env.DB),
      c.env.DB.prepare('SELECT COUNT(*) as total, SUM(is_active) as active FROM locations').first() as Promise<any>,
      c.env.DB.prepare('SELECT COUNT(*) as total, SUM(is_enabled) as enabled FROM module_settings').first() as Promise<any>,
      c.env.DB.prepare('SELECT COUNT(*) as total FROM staff_users WHERE is_active = 1').first() as Promise<any>,
    ])

    return c.json({
      success: true,
      data: {
        practiceName: settings.practice_name || 'OculoFlow Practice',
        locations: { total: locRows?.total || 0, active: locRows?.active || 0 },
        modules: { total: modRows?.total || 0, enabled: modRows?.enabled || 0 },
        users: { active: userRows?.total || 0 },
      }
    })
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 500)
  }
})

export default admin

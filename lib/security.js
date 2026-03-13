/**
 * Utilidades de seguridad — CartaMaster
 * Compatible con Vercel (sin filesystem). Users y audit en Supabase,
 * rate limiting en memoria (se resetea en cada cold start, aceptable para login).
 */
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from './authOptions.js';
import { db } from './supabase.js';

// ── Usuarios (Supabase) ───────────────────────────────────────
export async function getUsers() {
  const { data, error } = await db().from('usuarios').select('*');
  if (error) throw new Error('Error leyendo usuarios: ' + error.message);

  if (!data || data.length === 0) {
    // Primera vez: crear usuario admin por defecto desde variable de entorno
    if (!process.env.DEFAULT_ADMIN_PASS) {
      throw new Error(
        '[security.js] La variable de entorno DEFAULT_ADMIN_PASS no está definida.'
      );
    }
    const adminUser = process.env.DEFAULT_ADMIN_USER || 'ADMIN';
    const adminNombre = process.env.DEFAULT_ADMIN_NOMBRE || adminUser;
    const pass = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASS, 12);
    await db().from('usuarios').insert({
      username: adminUser, pass, rol: 'admin', nombre: adminNombre,
    });
    return { [adminUser]: { pass, rol: 'admin', nombre: adminNombre } };
  }

  return Object.fromEntries(
    data.map(u => [u.username, { pass: u.pass, rol: u.rol, nombre: u.nombre, empresa_id: u.empresa_id || null }])
  );
}

export async function saveUsers(users) {
  const usernames = Object.keys(users);
  const rows = Object.entries(users).map(([username, v]) => ({
    username,
    pass:       v.pass,
    rol:        v.rol,
    nombre:     v.nombre || username,
    updated_at: new Date().toISOString(),
  }));

  // Borrar usuarios que ya no están en la lista
  const { data: existing } = await db().from('usuarios').select('username');
  if (existing) {
    const toDelete = existing.map(r => r.username).filter(u => !usernames.includes(u));
    for (const u of toDelete) {
      await db().from('usuarios').delete().eq('username', u);
    }
  }

  const { error } = await db()
    .from('usuarios')
    .upsert(rows, { onConflict: 'username' });
  if (error) throw new Error('Error guardando usuarios: ' + error.message);
}

// ── Verificar credenciales con bcrypt ────────────────────────
export async function verifyCredentials(username, password) {
  const users = await getUsers();
  const key = Object.keys(users).find(
    k => k.toLowerCase() === (username || '').trim().toLowerCase()
  );
  if (!key) return null;
  const valid = await bcrypt.compare(password, users[key].pass);
  if (!valid) return null;
  return { username: key, rol: users[key].rol, nombre: users[key].nombre || key, empresa_id: users[key].empresa_id || null };
}

// ── Hash de contraseña ───────────────────────────────────────
export async function hashPassword(plain) {
  return bcrypt.hash(plain.trim(), 12);
}

// ── Obtener IP real del request ──────────────────────────────
export function getIP(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

// ── Protección CSRF: verificar que Origin == Host ─────────────
export function checkCsrf(req) {
  const origin = req.headers.get('origin');
  const host   = req.headers.get('host');

  if (!origin) return null;

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return { error: `CSRF bloqueado: origen=${origin} host=${host}`, status: 403 };
    }
  } catch {
    return { error: 'Origin inválido', status: 403 };
  }
  return null;
}

// ── Rate limiting de login en Supabase ───────────────────────
const LOGIN_MAX     = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

export async function checkRateLimit(ip) {
  const now = new Date();
  const key = `login::${ip}`;

  const { data } = await db().from('rate_limit').select('*').eq('key', key).single();

  if (!data) return { blocked: false, remaining: LOGIN_MAX };

  if (data.locked_until && now < new Date(data.locked_until)) {
    const mins = Math.ceil((new Date(data.locked_until) - now) / 60000);
    return { blocked: true, message: `Demasiados intentos. Intenta en ${mins} min.`, remaining: 0 };
  }

  const firstAttempt = new Date(data.first_attempt);
  if (now - firstAttempt > LOGIN_LOCK_MS) {
    await db().from('rate_limit').delete().eq('key', key);
    return { blocked: false, remaining: LOGIN_MAX };
  }

  return { blocked: false, remaining: Math.max(0, LOGIN_MAX - data.attempts) };
}

export async function recordFailedAttempt(ip) {
  const now = new Date();
  const key = `login::${ip}`;

  const { data } = await db().from('rate_limit').select('*').eq('key', key).single();

  if (!data) {
    await db().from('rate_limit').insert({ key, attempts: 1, first_attempt: now.toISOString(), updated_at: now.toISOString() });
    return;
  }

  const newAttempts = (data.attempts || 0) + 1;
  const lockedUntil = newAttempts >= LOGIN_MAX ? new Date(now.getTime() + LOGIN_LOCK_MS).toISOString() : null;

  await db().from('rate_limit').update({
    attempts: newAttempts,
    locked_until: lockedUntil,
    updated_at: now.toISOString(),
  }).eq('key', key);
}

export async function clearRateLimit(ip) {
  await db().from('rate_limit').delete().eq('key', `login::${ip}`);
}

// ── Rate limiting de API en memoria ─────────────────────────
const API_MAX       = 30;
const API_WINDOW_MS = 60 * 1000;
const apiRateMap    = new Map();

export function checkApiRateLimit(req, route) {
  const ip  = getIP(req);
  const key = `${ip}::${route}`;
  const now = Date.now();
  const rec = apiRateMap.get(key) || { count: 0, windowStart: now };

  if (now - rec.windowStart > API_WINDOW_MS) {
    rec.count      = 0;
    rec.windowStart = now;
  }
  rec.count++;
  apiRateMap.set(key, rec);

  if (rec.count > API_MAX) {
    return { blocked: true, message: 'Límite de peticiones alcanzado. Espera un momento.' };
  }
  return { blocked: false };
}

// ── Audit log (Supabase) ─────────────────────────────────────
const AUDIT_ACTIONS = {
  LOGIN_OK:        '🟢 LOGIN_OK      ',
  LOGIN_FAIL:      '🔴 LOGIN_FAIL    ',
  USER_CREATE:     '➕ USER_CREATE   ',
  USER_UPDATE:     '✏️  USER_UPDATE   ',
  USER_DELETE:     '🗑️  USER_DELETE   ',
  PASS_CHANGE:     '🔑 PASS_CHANGE   ',
  ACCESS_DENY:     '🚫 ACCESS_DENY   ',
  CSRF_BLOCK:      '⛔ CSRF_BLOCK    ',
  RATE_BLOCK:      '⏱️  RATE_BLOCK    ',
  DATA_READ:       '📖 DATA_READ     ',
  CLIENT_CREATE:   '📋 CLIENT_CREATE ',
  CLIENT_UPDATE:   '✏️  CLIENT_UPDATE ',
  CLIENT_DELETE:   '🗑️  CLIENT_DELETE ',
  PAGO_CREATE:     '💰 PAGO_CREATE   ',
  PAGO_UPDATE:     '💱 PAGO_UPDATE   ',
  PAGO_DELETE:     '🗑️  PAGO_DELETE   ',
  CREDITO_CREATE:  '📊 CREDITO_CREATE',
  CREDITO_UPDATE:  '📊 CREDITO_UPDATE',
  CREDITO_DELETE:  '📊 CREDITO_DELETE',
  MONTH_CLOSE:     '📅 MONTH_CLOSE   ',
  DOC_UPLOAD:      '📄 DOC_UPLOAD    ',
  DOC_DELETE:      '📄 DOC_DELETE    ',
};

export function auditLog(action, username, ip, extra = '') {
  const label = AUDIT_ACTIONS[action] || action.padEnd(12);
  // Fire and forget — no bloqueamos la respuesta
  db().from('audit_log').insert({
    action:   label,
    username: String(username),
    ip:       String(ip),
    extra,
  }).then(() => {}).catch(err => {
    if (process.env.NODE_ENV !== 'production') console.error('[auditLog]', err?.message);
  });
}

export async function readAuditLog(lines = 100) {
  try {
    const { data, error } = await db()
      .from('audit_log')
      .select('*')
      .order('ts', { ascending: false })
      .limit(lines);
    if (error || !data) return [];
    return data.map(r =>
      `[${r.ts}] ${r.action} | user=${String(r.username || '').padEnd(12)} | ip=${String(r.ip || '').padEnd(15)} | ${r.extra || ''}`
    );
  } catch {
    return [];
  }
}

// ── Sanitizar input ──────────────────────────────────────────
export function sanitize(str, maxLen = 64) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;&|${}()[\]\\]/g, '').slice(0, maxLen).trim();
}

// ── Validar fortaleza de contraseña ─────────────────────────
export function validatePassword(pass) {
  if (!pass || pass.length < 8)           return 'Mínimo 8 caracteres';
  if (!/[A-Z]/.test(pass))               return 'Debe tener al menos una mayúscula';
  if (!/[0-9]/.test(pass))               return 'Debe tener al menos un número';
  if (!/[^A-Za-z0-9]/.test(pass))        return 'Debe tener al menos un carácter especial (!@#$%...)';
  return null;
}

// ── Verificar sesión en API routes ───────────────────────────
export async function requireAdmin(req) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: 'No autorizado', status: 401 };
  if (session.user.rol !== 'admin') return { error: 'Acceso denegado — solo administradores', status: 403 };
  return { session };
}

export async function requireAuth(req) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: 'No autorizado', status: 401 };
  return { session };
}

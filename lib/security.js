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
    const pass = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASS, 12);
    await db().from('usuarios').insert({
      username: 'CPEREZ', pass, rol: 'admin', nombre: 'Carlos Pérez',
    });
    return { CPEREZ: { pass, rol: 'admin', nombre: 'Carlos Pérez' } };
  }

  return Object.fromEntries(
    data.map(u => [u.username, { pass: u.pass, rol: u.rol, nombre: u.nombre }])
  );
}

export async function saveUsers(users) {
  const rows = Object.entries(users).map(([username, v]) => ({
    username,
    pass:       v.pass,
    rol:        v.rol,
    nombre:     v.nombre || username,
    updated_at: new Date().toISOString(),
  }));
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
  return { username: key, rol: users[key].rol, nombre: users[key].nombre || key };
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

// ── Rate limiting de login en memoria ────────────────────────
// Se resetea en cada cold start de Vercel — aceptable para login
const LOGIN_MAX     = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const loginRateMap  = new Map();

export function checkRateLimit(ip) {
  const now = Date.now();
  const rec = loginRateMap.get(ip) || { attempts: 0, firstAttempt: now, lockedUntil: 0 };

  if (rec.lockedUntil && now < rec.lockedUntil) {
    const mins = Math.ceil((rec.lockedUntil - now) / 60000);
    return { blocked: true, message: `Demasiados intentos. Intenta en ${mins} min.`, remaining: 0 };
  }
  if (now - rec.firstAttempt > LOGIN_LOCK_MS) {
    loginRateMap.set(ip, { attempts: 0, firstAttempt: now, lockedUntil: 0 });
    return { blocked: false, remaining: LOGIN_MAX };
  }
  return { blocked: false, remaining: Math.max(0, LOGIN_MAX - rec.attempts) };
}

export function recordFailedAttempt(ip) {
  const now = Date.now();
  const rec = loginRateMap.get(ip) || { attempts: 0, firstAttempt: now, lockedUntil: 0 };
  rec.attempts++;
  if (rec.attempts >= LOGIN_MAX) rec.lockedUntil = now + LOGIN_LOCK_MS;
  loginRateMap.set(ip, rec);
}

export function clearRateLimit(ip) {
  loginRateMap.delete(ip);
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
  LOGIN_OK:     '🟢 LOGIN_OK   ',
  LOGIN_FAIL:   '🔴 LOGIN_FAIL ',
  USER_CREATE:  '➕ USER_CREATE',
  USER_UPDATE:  '✏️  USER_UPDATE',
  USER_DELETE:  '🗑️  USER_DELETE',
  PASS_CHANGE:  '🔑 PASS_CHANGE',
  ACCESS_DENY:  '🚫 ACCESS_DENY',
  CSRF_BLOCK:   '⛔ CSRF_BLOCK ',
  RATE_BLOCK:   '⏱️  RATE_BLOCK ',
  DATA_READ:    '📖 DATA_READ  ',
};

export function auditLog(action, username, ip, extra = '') {
  const label = AUDIT_ACTIONS[action] || action.padEnd(12);
  // Fire and forget — no bloqueamos la respuesta
  db().from('audit_log').insert({
    action:   label,
    username: String(username),
    ip:       String(ip),
    extra,
  }).then(() => {}).catch(() => {});
}

export async function readAuditLog(lines = 100) {
  const { data, error } = await db()
    .from('audit_log')
    .select('*')
    .order('ts', { ascending: false })
    .limit(lines);
  if (error) return [];
  return data.map(r =>
    `[${r.ts}] ${r.action} | user=${String(r.username).padEnd(12)} | ip=${String(r.ip).padEnd(15)} | ${r.extra}`
  );
}

// ── Sanitizar input ──────────────────────────────────────────
export function sanitize(str, maxLen = 64) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;&|${}()[\]\\]/g, '').slice(0, maxLen).trim();
}

// ── Validar fortaleza de contraseña ─────────────────────────
export function validatePassword(pass) {
  if (!pass || pass.length < 8) return 'Mínimo 8 caracteres';
  if (!/[A-Z]/.test(pass))      return 'Debe tener al menos una mayúscula';
  if (!/[0-9]/.test(pass))      return 'Debe tener al menos un número';
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

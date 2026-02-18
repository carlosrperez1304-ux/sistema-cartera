/**
 * Utilidades de seguridad — CartaMaster
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from './authOptions.js';

// ── Rutas de archivos ────────────────────────────────────────
const DATA_DIR   = join(process.cwd(), 'data');
const USERS_FILE = join(DATA_DIR, 'users.json');
const AUDIT_FILE = join(DATA_DIR, 'audit.log');
const RATE_FILE  = join(DATA_DIR, 'ratelimit.json');

function ensureDir() {
  mkdirSync(DATA_DIR, { recursive: true });
  // Restringir permisos del directorio data/ (solo dueño puede leer/escribir)
  try { chmodSync(DATA_DIR, 0o700); } catch {}
}

function writeSecure(path, content) {
  writeFileSync(path, content);
  try { chmodSync(path, 0o600); } catch {} // solo el proceso puede leer
}

// ── Usuarios ─────────────────────────────────────────────────
const DEFAULTS = {
  'CPEREZ': { pass: bcrypt.hashSync('CartaMaster1', 12), rol: 'admin', nombre: 'Carlos Pérez' },
};

export function getUsers() {
  ensureDir();
  if (!existsSync(USERS_FILE)) {
    writeSecure(USERS_FILE, JSON.stringify(DEFAULTS, null, 2));
    return DEFAULTS;
  }
  return JSON.parse(readFileSync(USERS_FILE, 'utf8'));
}

export function saveUsers(users) {
  ensureDir();
  writeSecure(USERS_FILE, JSON.stringify(users, null, 2));
}

// ── Verificar credenciales con bcrypt ────────────────────────
export async function verifyCredentials(username, password) {
  const users = getUsers();
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
// Previene que sitios externos hagan peticiones en nombre del usuario
export function checkCsrf(req) {
  const origin = req.headers.get('origin');
  const host   = req.headers.get('host');

  // Peticiones sin Origin (ej: server-to-server) se permiten
  if (!origin) return null;

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return { error: `CSRF bloqueado: origen=${origin} host=${host}`, status: 403 };
    }
  } catch {
    return { error: 'Origin inválido', status: 403 };
  }
  return null; // OK
}

// ── Rate limiting: login — 5 intentos / 15 min ──────────────
const LOGIN_MAX     = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

function loadRateData() {
  ensureDir();
  if (!existsSync(RATE_FILE)) return {};
  try { return JSON.parse(readFileSync(RATE_FILE, 'utf8')); } catch { return {}; }
}
function saveRateData(data) {
  writeSecure(RATE_FILE, JSON.stringify(data));
}

export function checkRateLimit(ip) {
  const data = loadRateData();
  const now  = Date.now();
  const rec  = data[ip] || { attempts: 0, firstAttempt: now, lockedUntil: 0 };

  if (rec.lockedUntil && now < rec.lockedUntil) {
    const mins = Math.ceil((rec.lockedUntil - now) / 60000);
    return { blocked: true, message: `Demasiados intentos. Intenta en ${mins} min.`, remaining: 0 };
  }
  if (now - rec.firstAttempt > LOGIN_LOCK_MS) {
    data[ip] = { attempts: 0, firstAttempt: now, lockedUntil: 0 };
    saveRateData(data);
    return { blocked: false, remaining: LOGIN_MAX };
  }
  return { blocked: false, remaining: Math.max(0, LOGIN_MAX - rec.attempts) };
}

export function recordFailedAttempt(ip) {
  const data = loadRateData();
  const now  = Date.now();
  const rec  = data[ip] || { attempts: 0, firstAttempt: now, lockedUntil: 0 };
  rec.attempts++;
  if (rec.attempts >= LOGIN_MAX) rec.lockedUntil = now + LOGIN_LOCK_MS;
  data[ip] = rec;
  saveRateData(data);
}

export function clearRateLimit(ip) {
  const data = loadRateData();
  delete data[ip];
  saveRateData(data);
}

// ── Rate limiting de API: 30 peticiones / minuto por IP+ruta ─
// Protege endpoints sensibles distintos al login
const API_RATE_FILE = join(DATA_DIR, 'apiratelimit.json');
const API_MAX       = 30;
const API_WINDOW_MS = 60 * 1000; // 1 minuto

function loadApiRate() {
  if (!existsSync(API_RATE_FILE)) return {};
  try { return JSON.parse(readFileSync(API_RATE_FILE, 'utf8')); } catch { return {}; }
}

export function checkApiRateLimit(req, route) {
  const ip  = getIP(req);
  const key = `${ip}::${route}`;
  const now = Date.now();
  const all = loadApiRate();
  const rec = all[key] || { count: 0, windowStart: now };

  // Reiniciar ventana si pasó el tiempo
  if (now - rec.windowStart > API_WINDOW_MS) {
    rec.count = 0;
    rec.windowStart = now;
  }

  rec.count++;
  all[key] = rec;

  // Limpiar entradas viejas ocasionalmente
  if (Math.random() < 0.05) {
    for (const k of Object.keys(all)) {
      if (now - all[k].windowStart > API_WINDOW_MS * 2) delete all[k];
    }
  }
  writeSecure(API_RATE_FILE, JSON.stringify(all));

  if (rec.count > API_MAX) {
    return { blocked: true, message: `Límite de peticiones alcanzado. Espera un momento.` };
  }
  return { blocked: false };
}

// ── Audit log mejorado ───────────────────────────────────────
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
  ensureDir();
  const label = AUDIT_ACTIONS[action] || action.padEnd(12);
  const ts    = new Date().toISOString();
  const line  = `[${ts}] ${label} | user=${String(username).padEnd(12)} | ip=${String(ip).padEnd(15)} | ${extra}\n`;
  try { writeFileSync(AUDIT_FILE, line, { flag: 'a' }); } catch {}
}

// Leer las últimas N líneas del audit log (para el visor admin)
export function readAuditLog(lines = 100) {
  if (!existsSync(AUDIT_FILE)) return [];
  try {
    const content = readFileSync(AUDIT_FILE, 'utf8');
    return content.trim().split('\n').filter(Boolean).slice(-lines).reverse();
  } catch { return []; }
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

import {
  getUsers, saveUsers, requireAdmin,
  hashPassword, sanitize, validatePassword,
  auditLog, checkCsrf, checkApiRateLimit, getIP,
} from '../../../lib/security.js';

// GET — lista de usuarios sin contraseñas (solo admins autenticados)
export async function GET(req) {
  // Rate limit: 30 peticiones/min por IP
  const rl = checkApiRateLimit(req, 'GET:/api/usuarios');
  if (rl.blocked) {
    auditLog('RATE_BLOCK', '?', getIP(req), 'GET /api/usuarios');
    return Response.json({ error: rl.message }, { status: 429 });
  }

  const auth = await requireAdmin(req);
  if (auth.error) {
    auditLog('ACCESS_DENY', '?', getIP(req), `GET /api/usuarios: ${auth.error}`);
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const users = await getUsers();
  const safe  = Object.fromEntries(
    Object.entries(users).map(([k, v]) => [k, { rol: v.rol, nombre: v.nombre || k }])
  );
  return Response.json(safe);
}

// POST — crear o actualizar usuario (solo admins)
export async function POST(req) {
  // Protección CSRF
  const csrf = checkCsrf(req);
  if (csrf) {
    auditLog('CSRF_BLOCK', '?', getIP(req), 'POST /api/usuarios');
    return Response.json({ error: csrf.error }, { status: csrf.status });
  }

  // Rate limit: máx 10 creaciones/min por IP (más restrictivo)
  const rl = checkApiRateLimit(req, 'POST:/api/usuarios');
  if (rl.blocked) {
    auditLog('RATE_BLOCK', '?', getIP(req), 'POST /api/usuarios');
    return Response.json({ error: rl.message }, { status: 429 });
  }

  const auth = await requireAdmin(req);
  if (auth.error) {
    auditLog('ACCESS_DENY', '?', getIP(req), `POST /api/usuarios: ${auth.error}`);
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const body     = await req.json();
  const username = sanitize(body.username || '', 32).toUpperCase();
  const nombre   = sanitize(body.nombre   || '', 64);
  const pass     = (body.pass || '').trim();
  const rol      = ['admin', 'editor', 'viewer'].includes(body.rol) ? body.rol : 'viewer';
  const ip       = getIP(req);

  if (!username) return Response.json({ error: 'El nombre de usuario es requerido' }, { status: 400 });

  const users = await getUsers();
  const isNew = !users[username];

  if (isNew || pass) {
    const passError = validatePassword(pass);
    if (passError) return Response.json({ error: passError }, { status: 400 });
  }

  if (isNew) {
    users[username] = { pass: await hashPassword(pass), rol, nombre };
    auditLog('USER_CREATE', username, ip, `rol=${rol} by=${auth.session.user.username}`);
  } else {
    users[username].rol    = rol;
    users[username].nombre = nombre || users[username].nombre;
    if (pass) {
      users[username].pass = await hashPassword(pass);
      auditLog('PASS_CHANGE', username, ip, `by=${auth.session.user.username}`);
    }
    auditLog('USER_UPDATE', username, ip, `rol=${rol} by=${auth.session.user.username}`);
  }

  await saveUsers(users);
  return Response.json({ ok: true, username });
}

// DELETE — eliminar usuario (solo admins)
export async function DELETE(req) {
  // Protección CSRF
  const csrf = checkCsrf(req);
  if (csrf) {
    auditLog('CSRF_BLOCK', '?', getIP(req), 'DELETE /api/usuarios');
    return Response.json({ error: csrf.error }, { status: csrf.status });
  }

  // Rate limit
  const rl = checkApiRateLimit(req, 'DELETE:/api/usuarios');
  if (rl.blocked) {
    auditLog('RATE_BLOCK', '?', getIP(req), 'DELETE /api/usuarios');
    return Response.json({ error: rl.message }, { status: 429 });
  }

  const auth = await requireAdmin(req);
  if (auth.error) {
    auditLog('ACCESS_DENY', '?', getIP(req), `DELETE /api/usuarios: ${auth.error}`);
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { username } = await req.json();
  const currentUser  = auth.session.user.username;
  const ip           = getIP(req);

  if (!username) return Response.json({ error: 'Falta username' }, { status: 400 });
  if (username === currentUser) return Response.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 });

  const users  = await getUsers();
  const admins = Object.entries(users).filter(([, v]) => v.rol === 'admin');
  if (admins.length === 1 && users[username]?.rol === 'admin') {
    return Response.json({ error: 'Debe existir al menos un administrador' }, { status: 400 });
  }

  delete users[username];
  await saveUsers(users);
  auditLog('USER_DELETE', username, ip, `by=${currentUser}`);

  return Response.json({ ok: true });
}

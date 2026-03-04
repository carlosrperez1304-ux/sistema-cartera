import { requireAuth, getUsers, saveUsers, hashPassword, validatePassword, sanitize, auditLog, checkCsrf, getIP } from '../../../lib/security.js';
import { db } from '../../../lib/supabase.js';

// GET — perfil del usuario actual
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const username = auth.session.user.username;
  const users = await getUsers();
  const u = users[username] || {};

  // Última conexión desde audit_log
  const { data: logs } = await db()
    .from('audit_log')
    .select('ts')
    .ilike('action', '%LOGIN_OK%')
    .eq('username', username)
    .order('ts', { ascending: false })
    .limit(2); // el primero es la sesión actual, el segundo es la última anterior

  const ultimaConexion = logs?.[1]?.ts || logs?.[0]?.ts || null;

  return Response.json({
    username,
    nombre:         u.nombre || username,
    rol:            auth.session.user.rol || 'viewer',
    empresa_id:     auth.session.user.empresa_id || null,
    email:          auth.session.user.email || null,
    ultimaConexion,
  });
}

// PATCH — el usuario actualiza su propio nombre o contraseña
export async function PATCH(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const username = auth.session.user.username;
  const body = await req.json();
  const { nombre, passActual, passNueva } = body;

  const users = await getUsers();
  if (!users[username]) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

  if (nombre !== undefined) {
    users[username].nombre = sanitize(nombre, 64);
  }

  if (passNueva) {
    // Validar contraseña actual
    const bcrypt = (await import('bcryptjs')).default;
    const ok = await bcrypt.compare(passActual || '', users[username].pass);
    if (!ok) return Response.json({ error: 'Contraseña actual incorrecta' }, { status: 400 });

    const err = validatePassword(passNueva);
    if (err) return Response.json({ error: err }, { status: 400 });

    users[username].pass = await hashPassword(passNueva);
    auditLog('PASS_CHANGE', username, getIP(req), 'self-service');
  }

  await saveUsers(users);
  auditLog('USER_UPDATE', username, getIP(req), 'perfil propio actualizado');
  return Response.json({ ok: true });
}

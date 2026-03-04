import { requireAdmin, getUsers } from '../../../../lib/security.js';
import { db } from '../../../../lib/supabase.js';

// GET — lista de usuarios enriquecida (email + último login) solo para admins
export async function GET(req) {
  const auth = await requireAdmin(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const users = await getUsers();

  // Último login por usuario desde audit_log
  const { data: logs } = await db()
    .from('audit_log')
    .select('username, ts')
    .ilike('action', '%LOGIN_OK%')
    .order('ts', { ascending: false });

  const lastLogin = {};
  (logs || []).forEach(l => {
    if (!lastLogin[l.username]) lastLogin[l.username] = l.ts;
  });

  const result = Object.fromEntries(
    Object.entries(users).map(([k, v]) => [k, {
      nombre:     v.nombre || k,
      rol:        v.rol || 'viewer',
      email:      v.email || null,
      ultimoLogin: lastLogin[k] || null,
    }])
  );

  return Response.json(result);
}

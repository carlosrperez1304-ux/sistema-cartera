import { db } from '../../../lib/supabase.js';
import { requireAuth, requireAdmin, checkCsrf } from '../../../lib/security.js';

// GET — devuelve { rol: { permiso: activo } } para todos los roles
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await db().from('permisos_rol').select('rol, permiso, activo');
  // Si la tabla aún no existe en Supabase, devolver objeto vacío (permisos por defecto)
  if (error) {
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      return Response.json({});
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const resultado = {};
  for (const { rol, permiso, activo } of (data || [])) {
    if (!resultado[rol]) resultado[rol] = {};
    resultado[rol][permiso] = activo;
  }
  return Response.json(resultado);
}

// POST — actualizar un permiso (solo admin)
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAdmin(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { rol, permiso, activo } = await req.json();
  if (!rol || !permiso || activo === undefined) {
    return Response.json({ error: 'Faltan campos: rol, permiso, activo' }, { status: 400 });
  }

  const { error } = await db().from('permisos_rol')
    .upsert({ rol, permiso, activo }, { onConflict: 'rol,permiso' });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

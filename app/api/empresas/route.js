import { db } from '../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../lib/security.js';

// Solo admin puede gestionar empresas
async function requireAdmin(req) {
  const auth = await requireAuth(req);
  if (auth.error) return { error: auth.error, status: auth.status };
  if (auth.session.user.rol !== 'admin') return { error: 'Solo administradores', status: 403 };
  return auth;
}

// GET — listar empresas
export async function GET(req) {
  const auth = await requireAdmin(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await db()
    .from('empresas')
    .select('*')
    .order('id');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

// POST — crear empresa
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAdmin(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { nombre, slug } = await req.json();
  if (!nombre || !slug) return Response.json({ error: 'nombre y slug son obligatorios' }, { status: 400 });

  const { data, error } = await db()
    .from('empresas')
    .insert({ nombre, slug, activa: true })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

// PATCH — actualizar empresa o asignar usuario a empresa
export async function PATCH(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAdmin(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();

  // Asignar usuario a empresa
  if (body.username && body.empresa_id !== undefined) {
    const { error } = await db()
      .from('usuarios')
      .update({ empresa_id: body.empresa_id })
      .eq('username', body.username);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // Actualizar empresa
  if (body.id) {
    const { error } = await db()
      .from('empresas')
      .update({ nombre: body.nombre, activa: body.activa })
      .eq('id', body.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Datos inválidos' }, { status: 400 });
}

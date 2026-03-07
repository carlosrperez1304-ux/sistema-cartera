import { db } from '../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../lib/security.js';

// Borrar notas del mes anterior si es día 1
async function limpiarNotasViejas(empresa_id, username) {
  const hoy = new Date();
  if (hoy.getDate() !== 1) return;
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
  await db()
    .from('notas_dashboard')
    .delete()
    .lt('created_at', inicioMesActual)
    .eq('empresa_id', empresa_id)
    .eq('usuario', username);
}

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const empresa_id = auth.session.user.empresa_id;
  const username   = auth.session.user.username;

  await limpiarNotasViejas(empresa_id, username);

  const { data, error } = await db()
    .from('notas_dashboard')
    .select('*')
    .eq('empresa_id', empresa_id)
    .eq('usuario', username)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { texto } = await req.json();
  if (!texto?.trim()) return Response.json({ error: 'Nota vacía' }, { status: 400 });

  const empresa_id = auth.session.user.empresa_id;
  const username   = auth.session.user.username;
  const nombre     = auth.session.user.name || username;

  const { data, error } = await db()
    .from('notas_dashboard')
    .insert({ texto: texto.trim(), usuario: username, nombre, empresa_id })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'ID requerido' }, { status: 400 });

  const empresa_id = auth.session.user.empresa_id;
  const username   = auth.session.user.username;

  const { error } = await db()
    .from('notas_dashboard')
    .delete()
    .eq('id', id)
    .eq('empresa_id', empresa_id)
    .eq('usuario', username);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

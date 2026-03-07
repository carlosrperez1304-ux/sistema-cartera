import { db } from '../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../lib/security.js';

// Borrar notas del mes anterior si es día 1
async function limpiarNotasViejas(empresa_id) {
  const hoy = new Date();
  if (hoy.getDate() !== 1) return;
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
  await db()
    .from('notas_dashboard')
    .delete()
    .lt('created_at', inicioMesActual)
    .eq('empresa_id', empresa_id);
}

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const empresa_id = auth.user?.empresa_id;
  await limpiarNotasViejas(empresa_id);

  const { data, error } = await db()
    .from('notas_dashboard')
    .select('*')
    .eq('empresa_id', empresa_id)
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

  const empresa_id = auth.user?.empresa_id;
  const usuario = auth.user?.username || auth.user?.email || 'Usuario';

  const { data, error } = await db()
    .from('notas_dashboard')
    .insert({ texto: texto.trim(), usuario, empresa_id })
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

  const empresa_id = auth.user?.empresa_id;

  const { error } = await db()
    .from('notas_dashboard')
    .delete()
    .eq('id', id)
    .eq('empresa_id', empresa_id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

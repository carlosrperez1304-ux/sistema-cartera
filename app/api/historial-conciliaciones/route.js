import { db } from '../../../lib/supabase.js';
import { requireAuth, requireAdmin, checkCsrf } from '../../../lib/security.js';

// GET — últimas 20 conciliaciones
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await db()
    .from('historial_conciliaciones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

// POST — registrar una conciliación
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const { data, error } = await db().from('historial_conciliaciones').insert({
    mes_key: body.mes_key || null,
    datos:   body.datos || body,
    usuario: auth.session.user.username,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

// DELETE — limpiar historial (solo admin)
export async function DELETE(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAdmin(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { error } = await db().from('historial_conciliaciones').delete().neq('id', 0);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

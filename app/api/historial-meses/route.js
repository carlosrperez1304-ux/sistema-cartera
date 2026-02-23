import { db } from '../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../lib/security.js';

// GET — todos los snapshots mensuales
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const empresa_id = auth.session.user.empresa_id || null;
  let q = db().from('historial_meses').select('mes_key, datos').order('mes_key');
  if (empresa_id) q = q.eq('empresa_id', empresa_id);
  const { data, error } = await q;

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

// POST — guardar/actualizar snapshot de un mes
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { mes_key, datos } = await req.json();
  if (!mes_key) return Response.json({ error: 'mes_key es obligatorio.' }, { status: 400 });

  const empresa_id = auth.session.user.empresa_id || null;
  const { error } = await db().from('historial_meses').upsert(
    { mes_key, datos, empresa_id, updated_at: new Date().toISOString() },
    { onConflict: 'mes_key,empresa_id' }
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

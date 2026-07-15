import { db } from '../../../lib/supabase.js';
import { requireAuth } from '../../../lib/security.js';

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const agente = searchParams.get('agente');

  let query = db()
    .from('notificaciones_pendientes')
    .select('*')
    .eq('enviado', false)
    .lte('programada_para', new Date().toISOString())
    .order('created_at', { ascending: true });

  if (agente) {
    query = query.eq('agente', agente);
  }

  const { data, error } = await query;
  if (error) return Response.json([]);
  return Response.json(data || []);
}

export async function PUT(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const { id } = body;
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });

  const { error } = await db()
    .from('notificaciones_pendientes')
    .update({ enviado: true })
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

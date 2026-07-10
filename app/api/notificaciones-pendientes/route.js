import { db } from '../../../lib/supabase.js';

export async function GET(req) {
  const { data, error } = await db()
    .from('notificaciones_pendientes')
    .select('*')
    .eq('enviado', false)
    .lte('programada_para', new Date().toISOString())
    .order('created_at', { ascending: true });

  if (error) return Response.json([]);
  return Response.json(data || []);
}

export async function PUT(req) {
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

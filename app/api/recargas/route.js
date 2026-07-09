import { db } from '../../../lib/supabase.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const empresa_id = searchParams.get('empresa_id');
  const mes = searchParams.get('mes');
  if (!empresa_id) return Response.json([]);
  let query = db().from('recargas').select('*').eq('empresa_id', empresa_id);
  if (mes) query = query.eq('mes', mes);
  const { data, error } = await query;
  if (error) return Response.json([]);
  return Response.json(data || []);
}

export async function POST(req) {
  const body = await req.json();
  const { cliente_id, empresa_id, mes, comision, monto_servicio, notificado, aplicar_a } = body;
  if (!cliente_id || !empresa_id || !mes) return Response.json({ error: 'Faltan datos' }, { status: 400 });
  const { data, error } = await db().from('recargas').insert({ cliente_id, empresa_id, mes, comision: comision || 0, monto_servicio: monto_servicio || 0, notificado: notificado || false, aplicar_a: aplicar_a || 'servicio' }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(req) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });
  updates.updated_at = new Date().toISOString();
  const { data, error } = await db().from('recargas').update(updates).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });
  await db().from('recargas').delete().eq('id', id);
  return Response.json({ ok: true });
}

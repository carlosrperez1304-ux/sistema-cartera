import { db } from '../../../lib/supabase.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const empresa_id = searchParams.get('empresa_id');
  if (!empresa_id) return Response.json([]);
  const { data, error } = await db().from('clientes_vinculos').select('*').eq('empresa_id', empresa_id);
  if (error) return Response.json([]);
  return Response.json(data || []);
}

export async function POST(req) {
  const body = await req.json();
  const { empresa_id, ids, nombre } = body;
  if (!empresa_id || !ids || !nombre) return Response.json({ error: 'Faltan datos' }, { status: 400 });
  const { data, error } = await db().from('clientes_vinculos').insert({ empresa_id, ids, nombre }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });
  await db().from('clientes_vinculos').delete().eq('id', id);
  return Response.json({ ok: true });
}

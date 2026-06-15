import { db } from '../../../lib/supabase.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const cliente_id = searchParams.get('cliente_id');
  if (!cliente_id) return Response.json([]);

  const { data, error } = await db()
    .from('subgrupos_cliente')
    .select('*')
    .eq('cliente_id', cliente_id)
    .order('created_at', { ascending: true });

  if (error) return Response.json([]);
  return Response.json(data);
}

export async function POST(req) {
  const body = await req.json();
  const { cliente_id, nombre, monto, estado, contacto, empresa_id } = body;
  if (!cliente_id || !nombre) return Response.json({ error: 'Faltan datos' }, { status: 400 });

  const { data, error } = await db()
    .from('subgrupos_cliente')
    .insert({ cliente_id, nombre, monto: monto || 0, estado: estado || 'Pendiente', contacto, empresa_id })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(req) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });

  updates.updated_at = new Date().toISOString();
  const { data, error } = await db()
    .from('subgrupos_cliente')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });

  await db().from('subgrupos_cliente').delete().eq('id', id);
  return Response.json({ ok: true });
}

import { db } from '../../../lib/supabase.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const empresa_id = searchParams.get('empresa_id');
  let query = db().from('grupos_blueline').select('*').order('numero', { ascending: true, nullsFirst: false });
  if (empresa_id) query = query.eq('empresa_id', empresa_id);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data || []);
}

export async function POST(req) {
  const body = await req.json();
  const { data, error } = await db().from('grupos_blueline').insert([body]).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(req) {
  const body = await req.json();
  const { id, ...rest } = body;
  rest.updated_at = new Date().toISOString();
  const { data, error } = await db().from('grupos_blueline').update(rest).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const { error } = await db().from('grupos_blueline').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

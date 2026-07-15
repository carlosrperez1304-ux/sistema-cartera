import { db } from '../../../lib/supabase.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const empresa_id = searchParams.get('empresa_id');
  const mes = searchParams.get('mes');
  let query = db().from('factura_mensual_blueline').select('*');
  if (empresa_id) query = query.eq('empresa_id', empresa_id);
  if (mes) query = query.eq('mes', mes);
  query = query.order('created_at', { ascending: false }).limit(1);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data?.[0] || null);
}

export async function POST(req) {
  const body = await req.json();
  const { data, error } = await db().from('factura_mensual_blueline').insert([body]).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(req) {
  const body = await req.json();
  const { id, ...rest } = body;
  rest.updated_at = new Date().toISOString();
  const { data, error } = await db().from('factura_mensual_blueline').update(rest).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

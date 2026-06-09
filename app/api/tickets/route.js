import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const empresa_id = searchParams.get('empresa_id');
  const asignado_a = searchParams.get('asignado_a');

  let query = supabase.from('tickets').select('*').order('created_at', { ascending: false });
  if (empresa_id) query = query.eq('empresa_id', empresa_id);
  if (asignado_a) query = query.eq('asignado_a', asignado_a);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req) {
  const body = await req.json();
  const { data, error } = await supabase.from('tickets').insert([body]).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(req) {
  const body = await req.json();
  const { id, ...rest } = body;
  rest.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('tickets').update(rest).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const { error } = await supabase.from('tickets').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

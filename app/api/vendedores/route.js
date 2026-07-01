import { db } from '../../../lib/supabase.js';
import { requireAuth } from '../../../lib/security.js';

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  const empresa_id = auth.session.user.empresa_id;
  const { data, error } = await db()
    .from('vendedores')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order('nombre');
  if (error) return Response.json([]);
  return Response.json(data);
}

export async function POST(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  const empresa_id = auth.session.user.empresa_id;
  const { nombre, whatsapp } = await req.json();
  if (!nombre) return Response.json({ error: 'Falta nombre' }, { status: 400 });
  const { data, error } = await db()
    .from('vendedores')
    .insert({ nombre, whatsapp: whatsapp || null, empresa_id })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  const { id, nombre, whatsapp } = await req.json();
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });
  const { data, error } = await db()
    .from('vendedores')
    .update({ nombre, whatsapp: whatsapp || null })
    .eq('id', id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });
  await db().from('vendedores').delete().eq('id', id);
  return Response.json({ ok: true });
}

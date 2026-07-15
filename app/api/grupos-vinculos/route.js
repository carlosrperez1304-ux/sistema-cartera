import { db } from '../../../lib/supabase.js';
import { requireAuth } from '../../../lib/security.js';

export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const empresa_id = searchParams.get('empresa_id');
  if (!empresa_id) return Response.json([]);
  try {
    const { data, error } = await db().from('grupos_vinculos').select('*').eq('empresa_id', empresa_id);
    if (error) { console.error('GET grupos-vinculos error:', error); return Response.json([]); }
    return Response.json(data || []);
  } catch (e) {
    console.error('GET grupos-vinculos exception:', e);
    return Response.json([]);
  }
}

export async function POST(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    const { empresa_id, ids, nombre } = body;
    if (!empresa_id || !ids || !nombre) return Response.json({ error: 'Faltan datos' }, { status: 400 });
    const { data, error } = await db().from('grupos_vinculos').insert({ empresa_id: Number(empresa_id), ids, nombre }).select().single();
    if (error) {
      console.error('POST grupos-vinculos error:', error);
      return Response.json({ error: error.message, details: error }, { status: 500 });
    }
    return Response.json(data);
  } catch (e) {
    console.error('POST grupos-vinculos exception:', e.message, e.stack);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    const { id, ids, nombre } = body;
    if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });
    const { data, error } = await db().from('grupos_vinculos').update({ ids, nombre }).eq('id', id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });
    await db().from('grupos_vinculos').delete().eq('id', id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

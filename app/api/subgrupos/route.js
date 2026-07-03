import { db } from '../../../lib/supabase.js';
import { requireAuth } from '../../../lib/security.js';

const ROLES_VER_TODO = ['admin', 'supervisor_cobro', 'supervisor_contabilidad'];

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const cliente_id = searchParams.get('cliente_id');
  const empresa_id = searchParams.get('empresa_id');
  const buscar = searchParams.get('buscar');

  if (buscar) {
    const { data, error } = await db()
      .from('subgrupos_cliente')
      .select('id, nombre, cliente_id, contacto, monto, estado')
      .ilike('nombre', '%' + buscar + '%')
      .limit(10);
    if (error) return Response.json([]);
    return Response.json(data);
  }

  let query = db().from('subgrupos_cliente').select('*').order('created_at', { ascending: true });

  if (cliente_id) {
    query = query.eq('cliente_id', cliente_id);
  } else if (empresa_id) {
    const auth = await requireAuth(req);
    if (!auth.error) {
      const username = auth.session.user.username;
      const puedeVerTodo = ROLES_VER_TODO.includes(auth.session.user.rol);
      if (!puedeVerTodo) {
        const { data: clientesUsuario } = await db()
          .from('clientes')
          .select('id')
          .eq('empresa_id', empresa_id)
          .eq('creado_por', username);
        const ids = (clientesUsuario || []).map(c => c.id);
        if (ids.length === 0) return Response.json([]);
        query = query.in('cliente_id', ids);
      } else {
        query = query.eq('empresa_id', empresa_id);
      }
    } else {
      query = query.eq('empresa_id', empresa_id);
    }
  } else {
    return Response.json([]);
  }

  const { data, error } = await query;
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

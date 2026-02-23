import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../lib/security.js';

// GET — gestiones de un cliente
export async function GET(req, { params }) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { clienteId: rawId } = await params;
  const clienteId = parseInt(rawId);
  if (isNaN(clienteId)) return Response.json({ error: 'clienteId inválido' }, { status: 400 });

  const { data, error } = await db()
    .from('gestiones')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json((data || []).map(g => ({
    id:           g.id,
    clienteId:    g.cliente_id,
    fecha:        g.fecha,
    tipo:         g.tipo,
    resultado:    g.resultado,
    nota:         g.nota,
    proximaFecha: g.proxima_fecha,
    usuario:      g.usuario,
    createdAt:    g.created_at,
  })));
}

// POST — registrar una gestión para un cliente
export async function POST(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { clienteId: rawId } = await params;
  const clienteId = parseInt(rawId);
  if (isNaN(clienteId)) return Response.json({ error: 'clienteId inválido' }, { status: 400 });

  const body = await req.json();
  const { data, error } = await db().from('gestiones').insert({
    cliente_id:    clienteId,
    fecha:         body.fecha         || new Date().toISOString(),
    tipo:          body.tipo          || '',
    resultado:     body.resultado     || '',
    nota:          body.nota          || null,
    proxima_fecha: body.proximaFecha  || null,
    usuario:       auth.session.user.username,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    id:           data.id,
    clienteId:    data.cliente_id,
    fecha:        data.fecha,
    tipo:         data.tipo,
    resultado:    data.resultado,
    nota:         data.nota,
    proximaFecha: data.proxima_fecha,
    usuario:      data.usuario,
    createdAt:    data.created_at,
  }, { status: 201 });
}

// DELETE — eliminar una gestión (?gestionId=X)
export async function DELETE(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { clienteId: rawId } = await params;
  const clienteId = parseInt(rawId);
  const { searchParams } = new URL(req.url);
  const gestionId = parseInt(searchParams.get('gestionId'));

  if (isNaN(clienteId) || isNaN(gestionId)) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const { error } = await db()
    .from('gestiones')
    .delete()
    .eq('id', gestionId)
    .eq('cliente_id', clienteId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

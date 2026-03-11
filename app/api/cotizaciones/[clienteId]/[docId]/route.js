import { db } from '../../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../../lib/security.js';

// PATCH — actualizar estado de una cotizacion
export async function PATCH(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { clienteId: rawClienteId, docId: rawDocId } = await params;
  const clienteId = parseInt(rawClienteId);
  const docId     = parseInt(rawDocId);
  if (isNaN(clienteId) || isNaN(docId)) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const body = await req.json();
  const update = {};
  if (body.estado      !== undefined) update.estado      = body.estado;
  if (body.monto       !== undefined) update.monto       = parseFloat(body.monto);
  if (body.nombre      !== undefined) update.nombre      = body.nombre;
  if (body.cliente_id  !== undefined) update.cliente_id  = parseInt(body.cliente_id);

  const { data, error } = await db()
    .from('cotizaciones')
    .update(update)
    .eq('id', docId)
    .eq('cliente_id', clienteId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    id:     data.id,
    nombre: data.nombre,
    base64: data.datos,
    fecha:  data.fecha,
    monto:  data.monto ? parseFloat(data.monto) : null,
    estado: data.estado || 'Cotizado',
    tipo:   data.tipo   || 'subido',
  });
}

// DELETE — eliminar una cotizacion
export async function DELETE(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { clienteId: rawClienteId, docId: rawDocId } = await params;
  const clienteId = parseInt(rawClienteId);
  const docId     = parseInt(rawDocId);
  if (isNaN(clienteId) || isNaN(docId)) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const { error } = await db()
    .from('cotizaciones')
    .delete()
    .eq('id', docId)
    .eq('cliente_id', clienteId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf, getIP, auditLog, sanitize } from '../../../../lib/security.js';

// PUT — actualizar cliente
export async function PUT(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const id   = parseInt(params.id);
  if (!id || isNaN(id) || id <= 0) {
    return Response.json({ error: 'ID de cliente inválido' }, { status: 400 });
  }
  const body = await req.json();

  const row = {
    nombre:             sanitize(body.nombre, 128),
    contacto:           body.contacto           || null,
    estado:             body.estado             || 'Cotizado',
    fecha_cotizacion:   body.fechaCotizacion     || null,
    fecha_notificacion: body.fechaNotificacion   || null,
    fecha_pago:         body.fechaPago           || null,
    fecha_facturacion:  body.fechaFacturacion    || null,
    fecha_suspension:   body.fechaSuspension     || null,
    mes:                body.mes                || null,
    anio:               body.año                || null,
    monto:              (body.monto !== null && body.monto !== undefined && body.monto !== '') ? parseFloat(body.monto) : null,
    comentario:         body.comentario ? sanitize(body.comentario, 500) : null,
    nota:               body.nota ? sanitize(body.nota, 500) : null,
    suspendido:         body.suspendido         || false,
    tags:               body.tags               || [],
    historial:          body.historial          || [],
    updated_at:         new Date().toISOString(),
  };

  const { error } = await db().from('clientes').update(row).eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Devolver el cliente actualizado con sus pagos
  const { data } = await db().from('clientes').select('*, pagos(*)').eq('id', id).single();

  return Response.json({
    ...body,
    id,
    pagosRealizados: body.pagosRealizados || (data?.pagos || []).map(p => ({
      id: p.id, monto: parseFloat(p.monto), fecha: p.fecha, fechaFormato: p.fecha_formato || '', nota: p.nota || '',
    })),
  });
}

// DELETE — eliminar cliente
export async function DELETE(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const id = parseInt(params.id);
  const { error } = await db().from('clientes').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  auditLog('DATA_READ', auth.session.user.username, getIP(req), `DELETE cliente id=${id}`);
  return Response.json({ ok: true });
}

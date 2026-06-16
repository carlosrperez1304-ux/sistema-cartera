import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf, getIP, auditLog, sanitize, checkApiRateLimit } from '../../../../lib/security.js';
import { getDelegationContext, logActividad } from '../../../../lib/delegation.js';

// PUT — actualizar cliente
export async function PUT(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id   = parseInt(rawId);
  if (!id || isNaN(id) || id <= 0) {
    return Response.json({ error: 'ID de cliente inválido' }, { status: 400 });
  }

  const username = auth.session.user.username;
  const userRol  = auth.session.user.rol || '';
  const esAdmin  = userRol === 'admin';

  // Verificar permisos de delegación si el usuario actúa como delegatario
  if (!esAdmin) {
    const ctx = await getDelegationContext(id, username);
    if (!ctx) return Response.json({ error: 'Cliente no encontrado.' }, { status: 404 });

    if (!ctx.esDueno && !ctx.esDelegatario) {
      return Response.json({ error: 'No tienes acceso a este cliente.' }, { status: 403 });
    }
    if (ctx.esDelegatario && ctx.permisos && (!ctx.permisos.can_edit || ctx.permisos.read_only)) {
      return Response.json({ error: 'No tienes permiso de edición en esta delegación.' }, { status: 403 });
    }

    // Registrar actividad si es delegatario
    if (ctx.esDelegatario) {
      logActividad(id, 'EDITAR', username, ctx.ownerId, ctx.delegationId,
        `Cliente #${id} editado por delegado ${username}`);
    }
  }

  const body = await req.json();

  // Protección: solo actualizar campos que vienen explícitamente en el body
  const row = { updated_at: new Date().toISOString() };
  if (body.nombre !== undefined && body.nombre !== null && body.nombre !== '')  row.nombre = sanitize(body.nombre, 128);
  if (body.contacto !== undefined)           row.contacto = body.contacto || null;
  if (body.estado !== undefined)             row.estado = body.estado || 'Cotizado';
  if (body.fechaCotizacion !== undefined)    row.fecha_cotizacion = body.fechaCotizacion || null;
  if (body.fechaNotificacion !== undefined)  row.fecha_notificacion = body.fechaNotificacion || null;
  if (body.fechaPago !== undefined)          row.fecha_pago = body.fechaPago || null;
  if (body.fechaFacturacion !== undefined)   row.fecha_facturacion = body.fechaFacturacion || null;
  if (body.fechaSuspension !== undefined)    row.fecha_suspension = body.fechaSuspension || null;
  if (body.mes !== undefined)                row.mes = body.mes || null;
  if (body.año !== undefined)                row.anio = body.año || null;
  if (body.monto !== undefined && body.monto !== null && body.monto !== '') row.monto = parseFloat(body.monto);
  if (body.codigoCliente !== undefined && body.codigoCliente !== null && body.codigoCliente !== '') row.codigo_cliente = parseInt(body.codigoCliente);
  if (body.comentario !== undefined)         row.comentario = body.comentario ? sanitize(body.comentario, 500) : null;
  if (body.nota !== undefined)               row.nota = body.nota ? sanitize(body.nota, 500) : null;
  if (body.suspendido !== undefined)         row.suspendido = body.suspendido || false;
  if (body.tags !== undefined)               row.tags = body.tags || [];
  if (body.historial !== undefined)          row.historial = body.historial || [];

  const { error } = await db().from('clientes').update(row).eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  auditLog('CLIENT_UPDATE', username, getIP(req), `cliente id=${id} estado=${body.estado || ''}`);

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

  const { id: rawId } = await params;
  const id = parseInt(rawId);

  const username = auth.session.user.username;
  const userRol  = auth.session.user.rol || '';
  const esAdmin  = userRol === 'admin';

  // Verificar permisos de delegación si es delegatario
  if (!esAdmin) {
    const ctx = await getDelegationContext(id, username);
    if (!ctx) return Response.json({ error: 'Cliente no encontrado.' }, { status: 404 });

    if (!ctx.esDueno && !ctx.esDelegatario) {
      return Response.json({ error: 'No tienes acceso a este cliente.' }, { status: 403 });
    }
    if (ctx.esDelegatario && ctx.permisos && (!ctx.permisos.can_delete || ctx.permisos.read_only)) {
      return Response.json({ error: 'No tienes permiso para eliminar clientes en esta delegación.' }, { status: 403 });
    }

    if (ctx.esDelegatario) {
      logActividad(id, 'ELIMINAR', username, ctx.ownerId, ctx.delegationId,
        `Cliente #${id} eliminado por delegado ${username}`);
    }
  }

  const { error } = await db().from('clientes').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  auditLog('CLIENT_DELETE', username, getIP(req), `cliente id=${id}`);
  return Response.json({ ok: true });
}

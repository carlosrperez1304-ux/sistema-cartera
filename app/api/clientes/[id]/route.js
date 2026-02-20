import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf, getIP, auditLog, sanitize } from '../../../../lib/security.js';
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
    codigo_cliente:     (body.codigoCliente !== null && body.codigoCliente !== undefined && body.codigoCliente !== '') ? parseInt(body.codigoCliente) : null,
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

  auditLog('DATA_READ', username, getIP(req), `DELETE cliente id=${id}`);
  return Response.json({ ok: true });
}

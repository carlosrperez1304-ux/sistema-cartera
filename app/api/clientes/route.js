import { db } from '../../../lib/supabase.js';
import { requireAuth, checkCsrf, getIP, auditLog, sanitize } from '../../../lib/security.js';

// Transforma fila DB → formato esperado por el frontend
function toFront(c) {
  return {
    id:                 c.id,
    nombre:             c.nombre,
    contacto:           c.contacto        || '',
    estado:             c.estado          || 'Cotizado',
    fechaCotizacion:    c.fecha_cotizacion    || '',
    fechaNotificacion:  c.fecha_notificacion  || '',
    fechaPago:          c.fecha_pago          || '',
    fechaFacturacion:   c.fecha_facturacion   || '',
    fechaSuspension:    c.fecha_suspension    || '',
    mes:                c.mes             || '',
    año:                c.anio            || '',
    monto:              c.monto           !== null ? String(c.monto) : '',
    codigoCliente:      c.codigo_cliente  !== null && c.codigo_cliente !== undefined ? String(c.codigo_cliente) : '',
    comentario:         c.comentario      || '',
    nota:               c.nota            || '',
    suspendido:         c.suspendido      || false,
    tags:               c.tags            || [],
    historial:          c.historial       || [],
    pagosRealizados: (c.pagos || []).map(p => ({
      id:           p.id,
      monto:        parseFloat(p.monto),
      fecha:        p.fecha,
      fechaFormato: p.fecha_formato || '',
      nota:         p.nota || '',
    })),
  };
}

// Transforma datos del frontend → formato para la DB
function toRow(body) {
  const parsedId = parseInt(body.id);
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
  // Solo incluir id si es un número válido (Supabase lo auto-genera si no se envía)
  if (!isNaN(parsedId) && parsedId > 0) row.id = parsedId;
  return row;
}

// GET — todos los clientes con sus pagos (sin documentos, se cargan por separado)
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await db()
    .from('clientes')
    .select('*, pagos(*)')
    .order('id');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json((data || []).map(toFront));
}

// POST — crear cliente
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();

  // Validación de campos obligatorios
  if (!body.nombre || !body.nombre.trim()) {
    return Response.json({ error: 'El campo nombre es obligatorio.' }, { status: 400 });
  }

  const row  = toRow(body);

  const { data, error } = await db().from('clientes').insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  auditLog('DATA_READ', auth.session.user.username, getIP(req), `CREATE cliente id=${data.id}`);
  return Response.json(toFront({ ...data, pagos: [] }), { status: 201 });
}

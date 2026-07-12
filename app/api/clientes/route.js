import { db } from '../../../lib/supabase.js';
import { requireAuth, checkCsrf, getIP, auditLog, sanitize, checkApiRateLimit } from '../../../lib/security.js';

// Roles que pueden ver TODOS los registros de todos los usuarios
const ROLES_VER_TODO = ['admin', 'supervisor_cobro', 'supervisor_contabilidad'];

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
    creadoPor:          c.creado_por      || '',
    assignedTo:         c.assigned_to     || '',
    delegationId:       c.delegation_id   || null,
    comentario:         c.comentario      || '',
    nota:               c.nota            || '',
    suspendido:         c.suspendido      || false,
    tags:               c.tags            || [],
    historial:          c.historial       || [],
    generaRecarga:      c.genera_recarga  || false,
    pagosRealizados: (c.pagos || []).map(p => ({
      id:           p.id,
      monto:        parseFloat(p.monto),
      fecha:        p.fecha,
      fechaFormato: p.fecha_formato || '',
      nota:         p.nota || '',
      mesFactura:   p.mes_factura || '',
      banco:        p.banco || '',
      bloqueado:    p.bloqueado || false,
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
    genera_recarga:     body.generaRecarga      || false,
    updated_at:         new Date().toISOString(),
  };
  if (!isNaN(parsedId) && parsedId > 0) row.id = parsedId;
  return row;
}

// GET — clientes filtrados por usuario (admins/supervisores ven todos)
// Visibilidad: creado_por = yo  OR  assigned_to = yo (delegados a mí)
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const userRol      = auth.session.user.rol || '';
  const username     = auth.session.user.username || '';
  const empresa_id   = auth.session.user.empresa_id || null;
  const puedeVerTodo = ROLES_VER_TODO.includes(userRol);

  // FIX: Validar que username solo tenga caracteres seguros antes de usarlo en query
  const safeUsername = /^[A-Za-z0-9_\-@.]+$/.test(username) ? username : '';
  if (!safeUsername && !puedeVerTodo) {
    return Response.json({ error: 'Usuario inválido' }, { status: 403 });
  }

  let query = db().from('clientes').select('*, pagos(*)').order('id');
  // Filtrar por empresa si el usuario tiene empresa asignada
  if (empresa_id) query = query.eq('empresa_id', empresa_id);
  if (!puedeVerTodo) {
    query = query.or(`creado_por.eq.${safeUsername},assigned_to.eq.${safeUsername}`);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json((data || []).map(toFront));
}

// POST — crear cliente (asigna creado_por al usuario actual)
export async function POST(req) {
  const rl = checkApiRateLimit(req, 'POST:/api/clientes');
  if (rl.blocked) return Response.json({ error: rl.message }, { status: 429 });
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();

  if (!body.nombre || !body.nombre.trim()) {
    return Response.json({ error: 'El campo nombre es obligatorio.' }, { status: 400 });
  }

  const row = toRow(body);
  row.creado_por  = auth.session.user.username;
  row.empresa_id  = auth.session.user.empresa_id || null;

  const { data, error } = await db().from('clientes').insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  auditLog('CLIENT_CREATE', auth.session.user.username, getIP(req), `cliente id=${data.id} nombre="${data.nombre}"`);
  return Response.json(toFront({ ...data, pagos: [] }), { status: 201 });
}

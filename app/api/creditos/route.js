import { db } from '../../../lib/supabase.js';
import { requireAuth, checkCsrf, sanitize } from '../../../lib/security.js';

const ROLES_VER_TODO = ['admin', 'supervisor_cobro', 'supervisor_contabilidad'];

function toFront(c) {
  return {
    id:               c.id,
    numeroOrden:      c.numero_orden     || '',
    cliente:          c.cliente          || '',
    monto:            c.monto !== null ? String(c.monto) : '',
    fechaInicio:      c.fecha_inicio     || '',
    plazoMeses:       c.plazo_meses      || '',
    fechaVencimiento: c.fecha_vencimiento || '',
    fechaPagoC:       c.fecha_pago_c     || '',
    estado:           c.estado           || 'Activo',
    comentario:       c.comentario       || '',
    creadoPor:        c.creado_por       || '',
    historial:        c.historial        || [],
    abonos: (c.abonos || []).map(a => ({
      id:           a.id,
      monto:        parseFloat(a.monto),
      fecha:        a.fecha,
      fechaFormato: a.fecha_formato || '',
    })),
  };
}

// GET — créditos filtrados por usuario (incluye delegaciones activas)
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const userRol = auth.session.user.rol || '';
  const username = auth.session.user.username || '';
  const puedeVerTodo = ROLES_VER_TODO.includes(userRol);

  let query = db()
    .from('creditos')
    .select('*, abonos(*)')
    .order('id');

  if (!puedeVerTodo) {
    // Buscar delegations activas hacia el usuario actual
    const { data: delegations, error: delError } = await db()
      .from('delegations')
      .select('owner_id')
      .eq('assigned_user_id', username)
      .eq('status', 'Activa');

    if (delError) {
      return Response.json({ error: delError.message }, { status: 500 });
    }

    const ownersDelegados = (delegations || []).map(d => d.owner_id);

    if (ownersDelegados.length > 0) {
      const ownersList = ownersDelegados.join(',');
      query = query.or(
        `creado_por.eq.${username},creado_por.in.(${ownersList})`
      );
    } else {
      query = query.eq('creado_por', username);
    }
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json((data || []).map(toFront));
}

// POST — crear crédito (asigna creado_por al usuario actual)
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const { abonos, ...creditoData } = body;

  if (!creditoData.cliente) {
    return Response.json({ error: 'El campo cliente es obligatorio.' }, { status: 400 });
  }
  const montoNum = parseFloat(creditoData.monto);
  if (!creditoData.monto || isNaN(montoNum) || montoNum <= 0) {
    return Response.json({ error: 'El monto debe ser un número mayor a 0.' }, { status: 400 });
  }

  const parsedId = parseInt(creditoData.id);
  const insertRow = {
    numero_orden:      creditoData.numeroOrden     || null,
    cliente:           creditoData.cliente,
    monto:             montoNum,
    fecha_inicio:      creditoData.fechaInicio     || null,
    plazo_meses:       creditoData.plazoMeses ? parseInt(creditoData.plazoMeses) : null,
    fecha_vencimiento: creditoData.fechaVencimiento|| null,
    fecha_pago_c:      creditoData.fechaPagoC      || null,
    estado:            creditoData.estado          || 'Activo',
    comentario:        creditoData.comentario ? sanitize(creditoData.comentario, 500) : null,
    historial:         creditoData.historial       || [],
    creado_por:        auth.session.user.username,
    updated_at:        new Date().toISOString(),
  };
  if (!isNaN(parsedId) && parsedId > 0) insertRow.id = parsedId;

  const { data, error } = await db().from('creditos').insert(insertRow).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (abonos && abonos.length > 0) {
    await db().from('abonos').insert(
      abonos.map(a => ({
        credito_id:    data.id,
        monto:         parseFloat(a.monto),
        fecha:         a.fecha || new Date().toISOString(),
        fecha_formato: a.fechaFormato || '',
      }))
    );
  }

  return Response.json(toFront({ ...data, abonos: abonos || [] }), { status: 201 });
}

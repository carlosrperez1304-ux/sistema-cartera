import { db } from '../../../lib/supabase.js';
import { requireAuth, checkCsrf, sanitize } from '../../../lib/security.js';

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
    historial:        c.historial        || [],
    abonos: (c.abonos || []).map(a => ({
      id:           a.id,
      monto:        parseFloat(a.monto),
      fecha:        a.fecha,
      fechaFormato: a.fecha_formato || '',
    })),
  };
}

// GET — todos los créditos con sus abonos
export async function GET(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await db()
    .from('creditos')
    .select('*, abonos(*)')
    .order('id');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json((data || []).map(toFront));
}

// POST — crear crédito (con sus abonos)
export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const body        = await req.json();
  const { abonos, ...creditoData } = body;

  // Validación de campos obligatorios
  if (!creditoData.cliente) {
    return Response.json({ error: 'El campo cliente es obligatorio.' }, { status: 400 });
  }
  const montoNum = parseFloat(creditoData.monto);
  if (!creditoData.monto || isNaN(montoNum) || montoNum <= 0) {
    return Response.json({ error: 'El monto debe ser un número mayor a 0.' }, { status: 400 });
  }

  const { data, error } = await db().from('creditos').insert({
    id:               parseInt(creditoData.id),
    numero_orden:     creditoData.numeroOrden     || null,
    cliente:          creditoData.cliente,
    monto:            creditoData.monto ? parseFloat(creditoData.monto) : null,
    fecha_inicio:     creditoData.fechaInicio     || null,
    plazo_meses:      creditoData.plazoMeses ? parseInt(creditoData.plazoMeses) : null,
    fecha_vencimiento:creditoData.fechaVencimiento|| null,
    fecha_pago_c:     creditoData.fechaPagoC      || null,
    estado:           creditoData.estado          || 'Activo',
    comentario:       creditoData.comentario ? sanitize(creditoData.comentario, 500) : null,
    historial:        creditoData.historial       || [],
    updated_at:       new Date().toISOString(),
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Insertar abonos si los hay
  if (abonos && abonos.length > 0) {
    await db().from('abonos').insert(
      abonos.map(a => ({
        id: a.id || Date.now() + Math.random(),
        credito_id: data.id,
        monto: parseFloat(a.monto),
        fecha: a.fecha || new Date().toISOString(),
        fecha_formato: a.fechaFormato || '',
      }))
    );
  }

  return Response.json(toFront({ ...data, abonos: abonos || [] }), { status: 201 });
}

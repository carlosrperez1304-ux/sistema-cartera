import { db } from '../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../lib/security.js';

// PUT — actualizar crédito (reemplaza abonos completos)
export async function PUT(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id          = parseInt(rawId);
  if (!id || isNaN(id) || id <= 0) {
    return Response.json({ error: 'ID de crédito inválido' }, { status: 400 });
  }
  const body        = await req.json();
  const { abonos }  = body;

  const { error } = await db().from('creditos').update({
    numero_orden:     body.numeroOrden      || null,
    cliente:          body.cliente,
    monto:            (body.monto !== null && body.monto !== undefined && body.monto !== '') ? parseFloat(body.monto) : null,
    fecha_inicio:     body.fechaInicio      || null,
    plazo_meses:      body.plazoMeses ? parseInt(body.plazoMeses) : null,
    fecha_vencimiento:body.fechaVencimiento || null,
    fecha_pago_c:     body.fechaPagoC       || null,
    estado:           body.estado           || 'Activo',
    comentario:       body.comentario       || null,
    vendedor:          body.vendedor          || null,
    vendedor_whatsapp: body.vendedor_whatsapp || null,
    historial:        body.historial        || [],
    updated_at:       new Date().toISOString(),
  }).eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Reemplazar abonos (delete all → insert new)
  const { error: delErr } = await db().from('abonos').delete().eq('credito_id', id);
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  if (abonos && abonos.length > 0) {
    const { error: insErr } = await db().from('abonos').insert(
      abonos.map(a => ({
        credito_id:   id,
        monto:        parseFloat(a.monto),
        fecha:        a.fecha,
        fecha_formato:a.fechaFormato || '',
      }))
    );
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, ...body, id });
}

// DELETE — eliminar crédito
export async function DELETE(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const id = parseInt(rawId);
  const { error } = await db().from('creditos').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

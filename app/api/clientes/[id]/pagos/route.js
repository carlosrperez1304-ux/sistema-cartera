import { db } from '../../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../../lib/security.js';

// POST — registrar un pago para un cliente
export async function POST(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const clienteId = parseInt(rawId);
  const body      = await req.json();

  const { data, error } = await db().from('pagos').insert({
    cliente_id:   clienteId,
    monto:        parseFloat(body.monto),
    fecha:        body.fecha || new Date().toISOString(),
    fecha_formato: body.fechaFormato || '',
    nota:         body.nota || null,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    ok: true,
    pago: {
      id:          data.id,
      monto:       parseFloat(data.monto),
      fecha:       data.fecha,
      fechaFormato: data.fecha_formato || '',
      nota:        data.nota || '',
    },
  }, { status: 201 });
}

// DELETE — eliminar un pago específico
export async function DELETE(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const { searchParams } = new URL(req.url);
  const pagoId = parseInt(searchParams.get('pagoId'));
  if (!pagoId) return Response.json({ error: 'Falta pagoId' }, { status: 400 });

  const { error } = await db().from('pagos').delete().eq('id', pagoId).eq('cliente_id', parseInt(rawId));
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

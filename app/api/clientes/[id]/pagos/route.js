import { db } from '../../../../../lib/supabase.js';
import { requireAuth, checkCsrf } from '../../../../../lib/security.js';

// POST — registrar un pago para un cliente
export async function POST(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const clienteId = parseInt(params.id);
  const body      = await req.json();

  const { error } = await db().from('pagos').insert({
    id:           body.id || Date.now(),
    cliente_id:   clienteId,
    monto:        parseFloat(body.monto),
    fecha:        body.fecha || new Date().toISOString(),
    fecha_formato: body.fechaFormato || '',
    nota:         body.nota || null,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, pago: body }, { status: 201 });
}

// DELETE — eliminar un pago específico
export async function DELETE(req, { params }) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const pagoId = parseInt(searchParams.get('pagoId'));
  if (!pagoId) return Response.json({ error: 'Falta pagoId' }, { status: 400 });

  const { error } = await db().from('pagos').delete().eq('id', pagoId).eq('cliente_id', parseInt(params.id));
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
